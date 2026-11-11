import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import SettingsPanel from '../SettingsPanel.jsx';
import * as mapsLib from '../../lib/maps.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SettingsPanel state lifecycle and persistence (#55)', () => {
  let container;
  let root;
  let openerButton;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    openerButton = document.createElement('button');
    openerButton.id = 'settings-toggle-button';
    document.body.appendChild(openerButton);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    openerButton.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('mounts tabs only on first visit and preserves draft state across tab switches', async () => {
    await act(async () => {
      root.render(
        <SettingsPanel
          isOpen={true}
          isDM={true}
          initialTab="users"
          tokens={[]}
          members={[]}
          onAddToken={vi.fn()}
        />,
      );
    });

    // On initial users tab, Maps and Tokens are not mounted
    expect(container.querySelector('.dm-tokens-tab')).toBeNull();
    expect(container.querySelector('.dm-maps-tab')).toBeNull();

    // Visit tokens tab
    const tokensTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Tokens',
    );
    await act(async () => {
      tokensTabButton.click();
    });

    // Now TokensTab is mounted and visible
    const tokensTab = container.querySelector('.dm-tokens-tab');
    expect(tokensTab).not.toBeNull();
    expect(tokensTab.hidden).toBe(false);

    // Enter draft token name
    const input = container.querySelector('#token-name-input');
    await act(async () => {
      setInputValue(input, 'Draft Goblin');
    });

    // Switch to another color swatch (e.g. Blue)
    const blueSwatch = container.querySelector('.dm-color-swatch[aria-label="Blue"]');
    await act(async () => {
      blueSwatch.click();
    });
    expect(blueSwatch.classList.contains('selected')).toBe(true);

    // Switch to Users tab
    const usersTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Users',
    );
    await act(async () => {
      usersTabButton.click();
    });

    // Tokens tab remains in the DOM but is hidden
    expect(container.querySelector('.dm-tokens-tab')).not.toBeNull();
    expect(container.querySelector('.dm-tokens-tab').hidden).toBe(true);

    // Switch back to Tokens tab
    await act(async () => {
      tokensTabButton.click();
    });

    // Draft name and selected color are preserved
    const restoredInput = container.querySelector('#token-name-input');
    expect(restoredInput.value).toBe('Draft Goblin');
    const restoredBlue = container.querySelector('.dm-color-swatch[aria-label="Blue"]');
    expect(restoredBlue.classList.contains('selected')).toBe(true);
  });

  it('preserves unfinished character creation form input across closing and reopening panel', async () => {
    const renderPanel = (isOpen, isDM = false) =>
      act(async () => {
        root.render(
          <SettingsPanel
            isOpen={isOpen}
            isDM={isDM}
            character={null}
            characters={[]}
            characterLoading={false}
            characterReady={true}
          />,
        );
      });

    await renderPanel(true);

    // Find character create form fields
    const nameInput = container.querySelector('#character-name');
    const hpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');
    expect(nameInput).not.toBeNull();

    await act(async () => {
      setInputValue(nameInput, 'Gimli Draft');
      setInputValue(hpInput, '45');
      setInputValue(acInput, '18');
    });

    expect(nameInput.value).toBe('Gimli Draft');
    expect(hpInput.value).toBe('45');
    expect(acInput.value).toBe('18');

    // Close settings panel
    await renderPanel(false);

    const panel = container.querySelector('.dm-floating-panel');
    expect(panel.hidden).toBe(true);
    expect(panel.style.display).toBe('none');

    // Reopen settings panel
    await renderPanel(true);

    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');

    // Draft fields are preserved
    expect(container.querySelector('#character-name').value).toBe('Gimli Draft');
    expect(container.querySelector('#character-max-hp').value).toBe('45');
    expect(container.querySelector('#character-ac').value).toBe('18');
  });

  it('resets panel and draft state when room changes (keyed by roomId)', async () => {
    const renderWithKey = (roomId) =>
      act(async () => {
        root.render(
          <SettingsPanel
            key={roomId}
            roomId={roomId}
            isOpen={true}
            isDM={false}
            character={null}
            characters={[]}
            characterLoading={false}
            characterReady={true}
          />,
        );
      });

    // Mount in Room A
    await renderWithKey('room-a');
    const nameInput = container.querySelector('#character-name');
    await act(async () => {
      setInputValue(nameInput, 'Room A Draft');
    });
    expect(container.querySelector('#character-name').value).toBe('Room A Draft');

    // Navigate to Room B
    await renderWithKey('room-b');
    // Draft from Room A must not carry over into Room B
    expect(container.querySelector('#character-name').value).toBe('');
  });

  it('resets active tab to Character if user role changes from DM to player', async () => {
    const renderWithRole = (isDM) =>
      act(async () => {
        root.render(
          <SettingsPanel
            isOpen={true}
            isDM={isDM}
            initialTab="tokens"
            tokens={[]}
            members={[]}
            onAddToken={vi.fn()}
          />,
        );
      });

    // Mount as DM on tokens tab
    await renderWithRole(true);
    expect(container.querySelector('.dm-tokens-tab')).not.toBeNull();

    // Demoted to player
    await renderWithRole(false);

    // Active tab must reset to character and DM tab content must not be mounted
    expect(container.querySelector('.dm-tokens-tab')).toBeNull();
    const activeTabButton = container.querySelector('.dm-tab-button.active');
    expect(activeTabButton.textContent).toBe('Character');
  });

  it('closes on Escape key press and returns focus to the settings toggle button', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<SettingsPanel isOpen={true} isDM={false} onClose={onClose} />);
    });

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(openerButton);
  });

  it('supports ArrowRight and ArrowLeft keyboard navigation across tabs', async () => {
    await act(async () => {
      root.render(<SettingsPanel isOpen={true} isDM={true} initialTab="character" />);
    });

    const charTab = container.querySelector('#settings-tab-character');
    await act(async () => {
      charTab.focus();
      charTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    // Active tab moved to Users
    expect(container.querySelector('.dm-tab-button.active').textContent).toBe('Users');
    expect(document.activeElement.textContent).toBe('Users');

    // ArrowLeft moves back to Character
    await act(async () => {
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
    });

    expect(container.querySelector('.dm-tab-button.active').textContent).toBe('Character');
    expect(document.activeElement.textContent).toBe('Character');
  });

  it('hides panel when closed and preserves draft inputs across panel reopening', async () => {
    const renderControls = (isOpen) =>
      act(async () => {
        root.render(
          <SettingsPanel
            isOpen={isOpen}
            isDM={true}
            initialTab="tokens"
            tokens={[]}
            members={[]}
            onAddToken={vi.fn()}
          />,
        );
      });

    await renderControls(true);

    const input = container.querySelector('#token-name-input');
    await act(async () => {
      setInputValue(input, 'Persistent Dragon');
    });

    // Close panel
    await renderControls(false);

    const panel = container.querySelector('.dm-floating-panel');
    expect(panel).not.toBeNull();
    expect(panel.hidden).toBe(true);
    expect(panel.style.display).toBe('none');

    // Reopen panel
    await renderControls(true);

    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');
    const restoredInput = container.querySelector('#token-name-input');
    expect(restoredInput.value).toBe('Persistent Dragon');
  });

  it('allows pending token creation to finish normally while panel/tab is hidden', async () => {
    let resolveTokenCreation;
    const pendingPromise = new Promise((resolve) => {
      resolveTokenCreation = resolve;
    });
    const onAddToken = vi.fn().mockReturnValue(pendingPromise);

    const renderControls = (isOpen, initialTab = 'tokens') =>
      act(async () => {
        root.render(
          <SettingsPanel
            isOpen={isOpen}
            isDM={true}
            initialTab={initialTab}
            tokens={[]}
            members={[]}
            onAddToken={onAddToken}
          />,
        );
      });

    await renderControls(true);

    const input = container.querySelector('#token-name-input');
    await act(async () => {
      setInputValue(input, 'Slow Goblin');
    });

    // Submit token form
    const submitBtn = container.querySelector('.dm-submit-btn');
    await act(async () => {
      submitBtn.click();
    });

    expect(onAddToken).toHaveBeenCalledWith('Slow Goblin', expect.any(String));
    expect(submitBtn.textContent).toBe('Adding...');

    // Switch to Users tab while pending
    const usersTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Users',
    );
    await act(async () => {
      usersTabButton.click();
    });

    // Resolve the token addition promise while hidden
    await act(async () => {
      resolveTokenCreation({ id: 'new-token' });
      await pendingPromise;
    });

    // Switch back to Tokens tab
    const tokensTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Tokens',
    );
    await act(async () => {
      tokensTabButton.click();
    });

    // Button restored to normal state
    expect(container.querySelector('.dm-submit-btn').textContent).toBe('Add Token');
  });

  it('preserves character creation draft and HP editor draft across tab switches and close/reopen', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 14, notes: '' };
    const characters = [character];

    const renderPanel = async (isOpen, activeTab = 'character') => {
      await act(async () => {
        root.render(
          <SettingsPanel
            isOpen={isOpen}
            isDM={true}
            initialTab={activeTab}
            character={character}
            characters={characters}
            onCreateCharacter={vi.fn()}
            onUpdateCharacterHp={vi.fn()}
            tokens={[]}
            members={[]}
          />,
        );
      });
    };

    // Open on character tab
    await renderPanel(true, 'character');

    // Type into character create form
    const nameInput = container.querySelector('#character-name');
    const maxHpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');
    await act(async () => {
      setInputValue(nameInput, 'Goblin Raider');
      setInputValue(maxHpInput, '18');
      setInputValue(acInput, '13');
    });

    // Type into HP editor
    const hpInput = container.querySelector('input[name="currentHp"]');
    await act(async () => {
      setInputValue(hpInput, '15');
    });

    // Switch to Users tab
    const usersTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Users',
    );
    await act(async () => {
      usersTabButton.click();
    });

    // Character tab is hidden
    expect(container.querySelector('.dm-character-tab').hidden).toBe(true);

    // Close panel
    await renderPanel(false);
    expect(container.querySelector('#settings-panel').hidden).toBe(true);

    // Reopen panel
    await renderPanel(true);
    expect(container.querySelector('#settings-panel').hidden).toBe(false);

    // Switch back to Character tab
    const charTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Character',
    );
    await act(async () => {
      charTabButton.click();
    });

    // Drafts survived!
    expect(container.querySelector('#character-name').value).toBe('Goblin Raider');
    expect(container.querySelector('#character-max-hp').value).toBe('18');
    expect(container.querySelector('#character-ac').value).toBe('13');
    expect(container.querySelector('input[name="currentHp"]').value).toBe('15');
  });

  it('refreshes members and maps when their tabs become visible, including on reopen', async () => {
    const onRefreshMembers = vi.fn();
    const getRoomMapsSpy = vi.spyOn(mapsLib, 'getRoomMaps').mockResolvedValue([]);

    const mockSupabase = {};
    const renderControls = (isOpen, initialTab = 'tokens') =>
      act(async () => {
        root.render(
          <SettingsPanel
            isDM={true}
            supabase={mockSupabase}
            roomId="room-123"
            isOpen={isOpen}
            initialTab={initialTab}
            tokens={[]}
            members={[]}
            onRefreshMembers={onRefreshMembers}
          />,
        );
      });

    // 1. Initial open on tokens tab
    await renderControls(true, 'tokens');
    expect(onRefreshMembers).toHaveBeenCalledTimes(1);

    // 2. Switch to Maps tab
    const mapsTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Maps',
    );
    await act(async () => {
      mapsTabButton.click();
    });
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(1);
    expect(onRefreshMembers).toHaveBeenCalledTimes(1); // not called again

    // 3. Switch back to Tokens tab
    const tokensTabButton = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === 'Tokens',
    );
    await act(async () => {
      tokensTabButton.click();
    });
    expect(onRefreshMembers).toHaveBeenCalledTimes(2);

    // 4. Close panel while on Tokens tab
    await renderControls(false, 'tokens');
    expect(onRefreshMembers).toHaveBeenCalledTimes(2); // no extra calls while closing

    // 5. Reopen panel on Tokens tab
    await renderControls(true, 'tokens');
    expect(onRefreshMembers).toHaveBeenCalledTimes(3);

    // 6. Switch to Maps tab and reopen lifecycle
    await act(async () => {
      mapsTabButton.click();
    });
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(2);

    await renderControls(false, 'maps');
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(2);

    await renderControls(true, 'maps');
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(3);
  });
});
