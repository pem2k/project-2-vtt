import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import DMControls from './DMControls.jsx';
import * as mapsLib from '../lib/maps.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('DMControls state lifecycle and persistence', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('mounts tabs only on first visit and preserves draft state across tab switches', async () => {
    await act(async () => {
      root.render(
        <DMControls
          isOpen={true}
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

  it('hides panel when closed and preserves draft inputs across panel reopening', async () => {
    const renderControls = (isOpen) =>
      act(async () => {
        root.render(
          <DMControls
            isOpen={isOpen}
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
          <DMControls
            isOpen={isOpen}
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

    const refreshedInput = container.querySelector('#token-name-input');
    expect(refreshedInput.value).toBe('');
    expect(container.querySelector('.dm-submit-btn').textContent).toBe('Add Token');
  });

  it('refreshes members and maps when their tabs become visible, including on reopen', async () => {
    const onRefreshMembers = vi.fn();
    const getRoomMapsSpy = vi.spyOn(mapsLib, 'getRoomMaps').mockResolvedValue([]);

    const mockSupabase = {};
    const renderControls = (isOpen, initialTab = 'tokens') =>
      act(async () => {
        root.render(
          <DMControls
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
