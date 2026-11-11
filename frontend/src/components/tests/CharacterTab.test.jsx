import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterTab from '../CharacterTab.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CharacterTab repeatable creation & role views (#14)', () => {
  let container;
  let root;

  beforeEach(() => {
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

  it('renders room character picker, selected card, and persistent create section for DM', async () => {
    const characters = [
      { id: 'c1', name: 'Goblin 1', hp: 7, max_hp: 10, ac: 12, notes: '' },
      { id: 'c2', name: 'Goblin 2', hp: 8, max_hp: 10, ac: 12, notes: '' },
    ];
    const onSelect = vi.fn();
    const onCreate = vi.fn();

    await act(async () => {
      root.render(
        <CharacterTab
          isDM={true}
          character={characters[0]}
          characters={characters}
          onSelect={onSelect}
          onCreate={onCreate}
          characterReady={true}
        />,
      );
    });

    // Picker is present
    const picker = container.querySelector('#character-card-picker');
    expect(picker).not.toBeNull();
    expect(picker.value).toBe('c1');

    // Selected character card is present
    expect(container.querySelector('.character-card-name').textContent).toBe('Goblin 1');

    // Create form is persistently present
    expect(container.querySelector('.character-create-section')).not.toBeNull();
    expect(container.querySelector('#character-name')).not.toBeNull();
  });

  it('renders picker and create section even when no character is selected for DM', async () => {
    await act(async () => {
      root.render(
        <CharacterTab
          isDM={true}
          character={null}
          characters={[]}
          onCreate={vi.fn()}
          characterReady={true}
        />,
      );
    });

    // No character card body
    expect(container.querySelector('.character-card-body')).toBeNull();

    // Persistent create form is still available
    expect(container.querySelector('.character-create-section')).not.toBeNull();
    expect(container.querySelector('#character-name')).not.toBeNull();
  });

  it('renders character card and NO create form for a player with a character', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 12, max_hp: 12, ac: 15, notes: '' };

    await act(async () => {
      root.render(
        <CharacterTab isDM={false} character={character} characters={[]} characterReady={true} />,
      );
    });

    // Character card is shown
    expect(container.querySelector('.character-card-name').textContent).toBe('Aria');

    // No picker
    expect(container.querySelector('#character-card-picker')).toBeNull();

    // No create form
    expect(container.querySelector('.character-create-section')).toBeNull();
    expect(container.querySelector('#character-name')).toBeNull();
  });

  it('renders create form and NO character card for a player without a character', async () => {
    await act(async () => {
      root.render(
        <CharacterTab
          isDM={false}
          character={null}
          characters={[]}
          onCreate={vi.fn()}
          characterReady={true}
        />,
      );
    });

    // No character card
    expect(container.querySelector('.character-card-body')).toBeNull();

    // Create form is shown
    expect(container.querySelector('#character-name')).not.toBeNull();
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('switches character when DM changes picker', async () => {
    const characters = [
      { id: 'c1', name: 'Goblin 1', hp: 7, max_hp: 10, ac: 12, notes: '' },
      { id: 'c2', name: 'Goblin 2', hp: 8, max_hp: 10, ac: 12, notes: '' },
    ];
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        <CharacterTab
          isDM={true}
          character={characters[0]}
          characters={characters}
          onSelect={onSelect}
          characterReady={true}
        />,
      );
    });

    const picker = container.querySelector('#character-card-picker');
    await act(async () => {
      picker.value = 'c2';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith(characters[1]);
  });
});
