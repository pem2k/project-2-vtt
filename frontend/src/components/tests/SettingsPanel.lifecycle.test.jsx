import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import SettingsPanel from '../SettingsPanel.jsx';
import * as mapsLib from '../../lib/maps.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DEFAULT_CHARACTER = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 14, notes: '' };

describe('SettingsPanel state lifecycle and persistence (#55)', () => {
  let container;
  let root;
  let openerButton;

  const renderPanel = async (props = {}) => {
    const { key, ...panelProps } = { isOpen: true, ...props };
    await act(async () => {
      root.render(<SettingsPanel key={key} {...panelProps} />);
    });
  };

  const clickTab = async (name) => {
    const tab = Array.from(container.querySelectorAll('.dm-tab-button')).find(
      (b) => b.textContent === name,
    );
    if (!tab) {
      throw new Error(`Tab "${name}" not found`);
    }
    await act(async () => {
      tab.click();
    });
    return tab;
  };

  const setInputValue = async (selectorOrElement, value) => {
    const input =
      typeof selectorOrElement === 'string'
        ? container.querySelector(selectorOrElement)
        : selectorOrElement;
    if (!input) {
      throw new Error(`Input element not found: ${selectorOrElement}`);
    }
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    await act(async () => {
      nativeInputValueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };

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
    await renderPanel({ isDM: true, initialTab: 'users' });

    // On initial users tab, Maps and Tokens are not mounted
    expect(container.querySelector('.dm-tokens-tab')).toBeNull();
    expect(container.querySelector('.dm-maps-tab')).toBeNull();

    // Visit tokens tab
    await clickTab('Tokens');

    // Now TokensTab is mounted and visible
    const tokensTab = container.querySelector('.dm-tokens-tab');
    expect(tokensTab).not.toBeNull();
    expect(tokensTab.hidden).toBe(false);

    // Enter draft token name
    await setInputValue('#token-name-input', 'Draft Goblin');

    // Switch to another color swatch (e.g. Blue)
    const blueSwatch = container.querySelector('.dm-color-swatch[aria-label="Blue"]');
    await act(async () => {
      blueSwatch.click();
    });
    expect(blueSwatch.classList.contains('selected')).toBe(true);

    // Switch to Users tab
    await clickTab('Users');

    // Tokens tab remains in the DOM but is hidden
    expect(container.querySelector('.dm-tokens-tab')).not.toBeNull();
    expect(container.querySelector('.dm-tokens-tab').hidden).toBe(true);

    // Switch back to Tokens tab
    await clickTab('Tokens');

    // Draft name and selected color are preserved
    expect(container.querySelector('#token-name-input').value).toBe('Draft Goblin');
    const restoredBlue = container.querySelector('.dm-color-swatch[aria-label="Blue"]');
    expect(restoredBlue.classList.contains('selected')).toBe(true);
  });

  it('preserves unfinished character creation form input across closing and reopening panel', async () => {
    await renderPanel();

    // Find character create form fields
    expect(container.querySelector('#character-name')).not.toBeNull();

    await setInputValue('#character-name', 'Gimli Draft');
    await setInputValue('#character-max-hp', '45');
    await setInputValue('#character-ac', '18');

    expect(container.querySelector('#character-name').value).toBe('Gimli Draft');
    expect(container.querySelector('#character-max-hp').value).toBe('45');
    expect(container.querySelector('#character-ac').value).toBe('18');

    // Close settings panel
    await renderPanel({ isOpen: false });

    const panel = container.querySelector('.dm-floating-panel');
    expect(panel.hidden).toBe(true);
    expect(panel.style.display).toBe('none');

    // Reopen settings panel
    await renderPanel({ isOpen: true });

    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');

    // Draft fields are preserved
    expect(container.querySelector('#character-name').value).toBe('Gimli Draft');
    expect(container.querySelector('#character-max-hp').value).toBe('45');
    expect(container.querySelector('#character-ac').value).toBe('18');
  });

  it('resets panel and draft state when room changes (keyed by roomId)', async () => {
    // Mount in Room A
    await renderPanel({ key: 'room-a', roomId: 'room-a' });
    await setInputValue('#character-name', 'Room A Draft');
    expect(container.querySelector('#character-name').value).toBe('Room A Draft');

    // Navigate to Room B
    await renderPanel({ key: 'room-b', roomId: 'room-b' });
    // Draft from Room A must not carry over into Room B
    expect(container.querySelector('#character-name').value).toBe('');
  });

  it('resets active tab to Character if user role changes from DM to player', async () => {
    // Mount as DM on tokens tab
    await renderPanel({ isDM: true, initialTab: 'tokens' });
    expect(container.querySelector('.dm-tokens-tab')).not.toBeNull();

    // Demoted to player
    await renderPanel({ isDM: false, initialTab: 'tokens' });

    // Active tab must reset to character and DM tab content must not be mounted
    expect(container.querySelector('.dm-tokens-tab')).toBeNull();
    const activeTabButton = container.querySelector('.dm-tab-button.active');
    expect(activeTabButton.textContent).toBe('Character');
  });

  it('closes on Escape key press and returns focus to the settings toggle button', async () => {
    const onClose = vi.fn();
    await renderPanel({ isDM: false, onClose });

    // Press Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(openerButton);
  });

  it('supports ArrowRight and ArrowLeft keyboard navigation across tabs', async () => {
    await renderPanel({ isDM: true, initialTab: 'character' });

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
    await renderPanel({ isDM: true, initialTab: 'tokens' });

    await setInputValue('#token-name-input', 'Persistent Dragon');

    // Close panel
    await renderPanel({ isOpen: false, isDM: true, initialTab: 'tokens' });

    const panel = container.querySelector('.dm-floating-panel');
    expect(panel).not.toBeNull();
    expect(panel.hidden).toBe(true);
    expect(panel.style.display).toBe('none');

    // Reopen panel
    await renderPanel({ isOpen: true, isDM: true, initialTab: 'tokens' });

    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');
    expect(container.querySelector('#token-name-input').value).toBe('Persistent Dragon');
  });

  it('allows pending token creation to finish normally while panel/tab is hidden', async () => {
    let resolveTokenCreation;
    const pendingPromise = new Promise((resolve) => {
      resolveTokenCreation = resolve;
    });
    const onAddToken = vi.fn().mockReturnValue(pendingPromise);

    await renderPanel({ isDM: true, initialTab: 'tokens', onAddToken });

    await setInputValue('#token-name-input', 'Slow Goblin');

    // Submit token form
    const submitBtn = container.querySelector('.dm-submit-btn');
    await act(async () => {
      submitBtn.click();
    });

    expect(onAddToken).toHaveBeenCalledWith('Slow Goblin', expect.any(String));
    expect(submitBtn.textContent).toBe('Adding...');

    // Switch to Users tab while pending
    await clickTab('Users');

    // Resolve the token addition promise while hidden
    await act(async () => {
      resolveTokenCreation({ id: 'new-token' });
      await pendingPromise;
    });

    // Switch back to Tokens tab
    await clickTab('Tokens');

    // Button restored to normal state
    expect(container.querySelector('.dm-submit-btn').textContent).toBe('Add Token');
  });

  it('preserves character creation draft and HP editor draft across tab switches and close/reopen', async () => {
    const panelProps = {
      isDM: true,
      initialTab: 'character',
      character: DEFAULT_CHARACTER,
      characters: [DEFAULT_CHARACTER],
    };

    // Open on character tab
    await renderPanel(panelProps);

    // Type into character create form
    await setInputValue('#character-name', 'Goblin Raider');
    await setInputValue('#character-max-hp', '18');
    await setInputValue('#character-ac', '13');

    // Type into HP editor
    await setInputValue('input[name="currentHp"]', '15');

    // Switch to Users tab
    await clickTab('Users');

    // Character tab is hidden
    expect(container.querySelector('.dm-character-tab').hidden).toBe(true);

    // Close panel
    await renderPanel({ ...panelProps, isOpen: false });
    expect(container.querySelector('#settings-panel').hidden).toBe(true);

    // Reopen panel
    await renderPanel({ ...panelProps, isOpen: true });
    expect(container.querySelector('#settings-panel').hidden).toBe(false);

    // Switch back to Character tab
    await clickTab('Character');

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
    const panelProps = {
      isDM: true,
      supabase: mockSupabase,
      roomId: 'room-123',
      initialTab: 'tokens',
      onRefreshMembers,
    };

    // 1. Initial open on tokens tab
    await renderPanel(panelProps);
    expect(onRefreshMembers).toHaveBeenCalledTimes(1);

    // 2. Switch to Maps tab
    await clickTab('Maps');
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(1);
    expect(onRefreshMembers).toHaveBeenCalledTimes(1); // not called again

    // 3. Switch back to Tokens tab
    await clickTab('Tokens');
    expect(onRefreshMembers).toHaveBeenCalledTimes(2);

    // 4. Close panel while on Tokens tab
    await renderPanel({ ...panelProps, isOpen: false });
    expect(onRefreshMembers).toHaveBeenCalledTimes(2); // no extra calls while closing

    // 5. Reopen panel on Tokens tab
    await renderPanel({ ...panelProps, isOpen: true });
    expect(onRefreshMembers).toHaveBeenCalledTimes(3);

    // 6. Switch to Maps tab and reopen lifecycle
    await clickTab('Maps');
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(2);

    await renderPanel({ ...panelProps, isOpen: false, initialTab: 'maps' });
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(2);

    await renderPanel({ ...panelProps, isOpen: true, initialTab: 'maps' });
    expect(getRoomMapsSpy).toHaveBeenCalledTimes(3);
  });
});
