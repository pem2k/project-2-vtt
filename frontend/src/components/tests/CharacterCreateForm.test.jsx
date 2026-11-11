import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterCreateForm from '../CharacterCreateForm.jsx';
import { createCharacterHarness, setInputValue, submitForm } from './helpers/characterHarness.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CharacterCreateForm', () => {
  let harness;
  let container;

  beforeEach(() => {
    harness = createCharacterHarness();
    container = harness.container;
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('rejects invalid inputs without calling onCreate', async () => {
    const onCreate = vi.fn();
    await harness.render(<CharacterCreateForm onCreate={onCreate} />);

    const form = container.querySelector('form');
    const nameInput = container.querySelector('#character-name');
    const maxHpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');

    await setInputValue(nameInput, '');
    await setInputValue(maxHpInput, '10');
    await setInputValue(acInput, '10');

    await submitForm(form);

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toMatch(/character name is required/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('submits valid inputs and clears fields on success', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 'new-char' });
    await harness.render(<CharacterCreateForm onCreate={onCreate} />);

    const form = container.querySelector('form');
    const nameInput = container.querySelector('#character-name');
    const maxHpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');

    await setInputValue(nameInput, 'Goblin 1');
    await setInputValue(maxHpInput, '15');
    await setInputValue(acInput, '12');

    await submitForm(form);

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Goblin 1',
      maxHp: 15,
      ac: 12,
    });

    expect(nameInput.value).toBe('');
    expect(maxHpInput.value).toBe('');
    expect(acInput.value).toBe('');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('preserves draft fields and shows friendly error on failure', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new Error('You already have a character in this room.'));
    await harness.render(<CharacterCreateForm onCreate={onCreate} />);

    const form = container.querySelector('form');
    const nameInput = container.querySelector('#character-name');
    const maxHpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');

    await setInputValue(nameInput, 'Hero');
    await setInputValue(maxHpInput, '20');
    await setInputValue(acInput, '15');

    await submitForm(form);

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toMatch(/already have a character/i);

    expect(nameInput.value).toBe('Hero');
    expect(maxHpInput.value).toBe('20');
    expect(acInput.value).toBe('15');
  });
});
