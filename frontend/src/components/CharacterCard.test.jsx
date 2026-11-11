import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterCard from './CharacterCard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input, value) {
  act(() => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('CharacterCard display & HP editor (#14)', () => {
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

  it('renders name, current HP input, max HP, Save button, AC, and notes', async () => {
    const character = {
      id: 'c1',
      name: 'Aria Shadowmend',
      hp: 7,
      max_hp: 12,
      ac: 15,
      notes: 'Has a cursed amulet',
    };

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);
    });

    expect(container.textContent).toContain('Aria Shadowmend');
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('AC 15');
    expect(container.textContent).toContain('Has a cursed amulet');

    const hpInput = container.querySelector('input[name="currentHp"]');
    expect(hpInput).not.toBeNull();
    expect(hpInput.value).toBe('7');

    const saveButton = container.querySelector('button.btn-save-hp');
    expect(saveButton).not.toBeNull();
    expect(saveButton.textContent).toContain('Save');

    // Notes and AC remain read-only
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelectorAll('input')).toHaveLength(1);
  });

  it('shows a placeholder when notes are empty', async () => {
    const character = {
      id: 'c2',
      name: 'Gobbo',
      hp: 10,
      max_hp: 10,
      ac: 10,
      notes: '',
    };

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);
    });

    expect(container.textContent).toContain('Gobbo');
    expect(container.textContent).toMatch(/no notes|none/i);
  });

  it('rejects blank, decimal, and out-of-range HP drafts without calling onUpdateHp', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 15, notes: '' };
    const onUpdateHp = vi.fn();

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={onUpdateHp} />);
    });

    const hpInput = container.querySelector('input[name="currentHp"]');
    const form = container.querySelector('form.character-hp-form');

    // Blank
    setInputValue(hpInput, '');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/required/i);
    expect(onUpdateHp).not.toHaveBeenCalled();

    // Decimal
    setInputValue(hpInput, '12.5');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/integer/i);
    expect(onUpdateHp).not.toHaveBeenCalled();

    // Out of range (negative)
    setInputValue(hpInput, '-1');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/between 0 and 20/i);
    expect(onUpdateHp).not.toHaveBeenCalled();

    // Out of range (exceeds max_hp)
    setInputValue(hpInput, '25');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/between 0 and 20/i);
    expect(onUpdateHp).not.toHaveBeenCalled();
  });

  it('submits valid HP change and disables button while saving', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 15, notes: '' };
    let resolveSave;
    const onUpdateHp = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={onUpdateHp} />);
    });

    const hpInput = container.querySelector('input[name="currentHp"]');
    const form = container.querySelector('form.character-hp-form');
    const saveButton = container.querySelector('button.btn-save-hp');

    setInputValue(hpInput, '15');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onUpdateHp).toHaveBeenCalledWith('c1', 15);
    expect(saveButton.disabled).toBe(true);

    await act(async () => {
      resolveSave({ ...character, hp: 15 });
    });

    expect(saveButton.disabled).toBe(false);
    expect(hpInput.value).toBe('15');
  });

  it('preserves draft and shows error on failed save', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 15, notes: '' };
    const onUpdateHp = vi.fn().mockRejectedValue(new Error('Network error'));

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={onUpdateHp} />);
    });

    const hpInput = container.querySelector('input[name="currentHp"]');
    const form = container.querySelector('form.character-hp-form');

    setInputValue(hpInput, '18');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(hpInput.value).toBe('18');
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/network error|failed/i);
  });

  it('does not overwrite an active dirty draft when a background update arrives', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 15, notes: '' };

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);
    });

    const hpInput = container.querySelector('input[name="currentHp"]');
    setInputValue(hpInput, '14'); // User types 14

    // Background update arrives with hp: 8
    await act(async () => {
      root.render(<CharacterCard character={{ ...character, hp: 8 }} onUpdateHp={vi.fn()} />);
    });

    // The user's active draft must be preserved!
    expect(hpInput.value).toBe('14');
  });

  it('updates draft when background update arrives and form is clean', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 15, notes: '' };

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);
    });

    const hpInput = container.querySelector('input[name="currentHp"]');
    expect(hpInput.value).toBe('10');

    // Background update arrives with hp: 6 (clean form)
    await act(async () => {
      root.render(<CharacterCard character={{ ...character, hp: 6 }} onUpdateHp={vi.fn()} />);
    });

    expect(hpInput.value).toBe('6');
  });

  it('resets draft when switching selected character', async () => {
    const char1 = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 15, notes: '' };
    const char2 = { id: 'c2', name: 'Goblin', hp: 5, max_hp: 8, ac: 12, notes: '' };

    await act(async () => {
      root.render(<CharacterCard character={char1} onUpdateHp={vi.fn()} />);
    });

    const hpInput = container.querySelector('input[name="currentHp"]');
    setInputValue(hpInput, '19');

    // Switch selected character
    await act(async () => {
      root.render(<CharacterCard character={char2} onUpdateHp={vi.fn()} />);
    });

    expect(container.querySelector('input[name="currentHp"]').value).toBe('5');
  });

  it('does not render a character selector or picker', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 12, max_hp: 12, ac: 15, notes: '' };

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);
    });

    expect(container.querySelector('#character-card-picker')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });

  it('displays friendly fallback and hides raw database details on save failure', async () => {
    const character = { id: 'c1', name: 'Aria', hp: 10, max_hp: 20, ac: 15, notes: '' };
    const rawDbError = new Error(
      'violates foreign key constraint characters_user_id_fkey on table "characters" (user_id)=(0000-uuid)',
    );
    const onUpdateHp = vi.fn().mockRejectedValue(rawDbError);

    await act(async () => {
      root.render(<CharacterCard character={character} onUpdateHp={onUpdateHp} />);
    });

    const hpInput = container.querySelector('input[name="currentHp"]');
    const form = container.querySelector('form.character-hp-form');

    setInputValue(hpInput, '14');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toBe('Failed to update HP.');
    expect(alert.textContent).not.toContain('uuid');
    expect(alert.textContent).not.toContain('foreign key');
  });
});
