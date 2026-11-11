import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterCard from '../CharacterCard.jsx';
import {
  createCharacter,
  createCharacterHarness,
  deferred,
  setInputValue,
  submitForm,
} from './helpers/characterHarness.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CharacterCard display & HP editor (#14)', () => {
  let harness;
  let container;

  beforeEach(() => {
    harness = createCharacterHarness();
    container = harness.container;
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('renders name, current HP input, max HP, Save button, AC, and notes', async () => {
    const character = createCharacter({
      name: 'Aria Shadowmend',
      hp: 7,
      max_hp: 12,
      ac: 15,
      notes: 'Has a cursed amulet',
    });

    await harness.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);

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

  it('rejects blank, decimal, and out-of-range HP drafts without calling onUpdateHp', async () => {
    const character = createCharacter({ hp: 10, max_hp: 20 });
    const onUpdateHp = vi.fn();

    await harness.render(<CharacterCard character={character} onUpdateHp={onUpdateHp} />);

    expect(container.textContent).toContain('No notes');

    const hpInput = container.querySelector('input[name="currentHp"]');
    const form = container.querySelector('form.character-hp-form');

    for (const [draft, pattern] of [
      ['', /required/i],
      ['12.5', /integer/i],
      ['-1', /between 0 and 20/i],
      ['25', /between 0 and 20/i],
    ]) {
      await setInputValue(hpInput, draft);
      await submitForm(form);
      expect(container.querySelector('[role="alert"]').textContent).toMatch(pattern);
      expect(onUpdateHp).not.toHaveBeenCalled();
    }
  });

  it('submits valid HP change and disables button while saving', async () => {
    const character = createCharacter({ hp: 10, max_hp: 20 });
    const { promise, resolve: resolveSave } = deferred();
    const onUpdateHp = vi.fn().mockReturnValue(promise);

    await harness.render(<CharacterCard character={character} onUpdateHp={onUpdateHp} />);

    const hpInput = container.querySelector('input[name="currentHp"]');
    const form = container.querySelector('form.character-hp-form');
    const saveButton = container.querySelector('button.btn-save-hp');

    await setInputValue(hpInput, '15');
    await submitForm(form);

    expect(onUpdateHp).toHaveBeenCalledWith('c1', 15);
    expect(saveButton.disabled).toBe(true);

    await act(async () => {
      resolveSave({ ...character, hp: 15 });
    });

    expect(saveButton.disabled).toBe(false);
    expect(hpInput.value).toBe('15');
  });

  it('does not overwrite an active dirty draft when a background update arrives', async () => {
    const character = createCharacter({ hp: 10, max_hp: 20 });

    await harness.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);

    const hpInput = container.querySelector('input[name="currentHp"]');
    await setInputValue(hpInput, '14'); // User types 14

    // Background update arrives with hp: 8
    await harness.render(
      <CharacterCard character={{ ...character, hp: 8 }} onUpdateHp={vi.fn()} />,
    );

    // The user's active draft must be preserved!
    expect(hpInput.value).toBe('14');
  });

  it('updates draft when background update arrives and form is clean', async () => {
    const character = createCharacter({ hp: 10, max_hp: 20 });

    await harness.render(<CharacterCard character={character} onUpdateHp={vi.fn()} />);

    const hpInput = container.querySelector('input[name="currentHp"]');
    expect(hpInput.value).toBe('10');

    // Background update arrives with hp: 6 (clean form)
    await harness.render(
      <CharacterCard character={{ ...character, hp: 6 }} onUpdateHp={vi.fn()} />,
    );

    expect(hpInput.value).toBe('6');
  });

  it('resets draft when switching selected character', async () => {
    const char1 = createCharacter({ id: 'c1', name: 'Aria', hp: 10, max_hp: 20 });
    const char2 = createCharacter({ id: 'c2', name: 'Goblin', hp: 5, max_hp: 8, ac: 12 });

    await harness.render(<CharacterCard character={char1} onUpdateHp={vi.fn()} />);

    const hpInput = container.querySelector('input[name="currentHp"]');
    await setInputValue(hpInput, '19');

    // Switch selected character
    await harness.render(<CharacterCard character={char2} onUpdateHp={vi.fn()} />);

    expect(container.querySelector('input[name="currentHp"]').value).toBe('5');
  });

  it('displays friendly fallback and hides raw database details on save failure', async () => {
    const character = createCharacter({ hp: 10, max_hp: 20 });
    const rawDbError = new Error(
      'violates foreign key constraint characters_user_id_fkey on table "characters" (user_id)=(0000-uuid)',
    );
    const onUpdateHp = vi.fn().mockRejectedValue(rawDbError);

    await harness.render(<CharacterCard character={character} onUpdateHp={onUpdateHp} />);

    const hpInput = container.querySelector('input[name="currentHp"]');
    const form = container.querySelector('form.character-hp-form');

    await setInputValue(hpInput, '14');
    await submitForm(form);

    expect(hpInput.value).toBe('14');

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toBe('Failed to update HP.');
    expect(alert.textContent).not.toContain('uuid');
    expect(alert.textContent).not.toContain('foreign key');
  });
});
