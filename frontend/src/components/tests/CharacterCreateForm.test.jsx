import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterCreateForm from '../CharacterCreateForm.jsx';

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

describe('CharacterCreateForm', () => {
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

  it('rejects invalid inputs without calling onCreate', async () => {
    const onCreate = vi.fn();
    await act(async () => {
      root.render(<CharacterCreateForm onCreate={onCreate} />);
    });

    const form = container.querySelector('form');
    const nameInput = container.querySelector('#character-name');
    const maxHpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');

    setInputValue(nameInput, '');
    setInputValue(maxHpInput, '10');
    setInputValue(acInput, '10');

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toMatch(/character name is required/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('submits valid inputs and clears fields on success', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 'new-char' });
    await act(async () => {
      root.render(<CharacterCreateForm onCreate={onCreate} />);
    });

    const form = container.querySelector('form');
    const nameInput = container.querySelector('#character-name');
    const maxHpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');

    setInputValue(nameInput, 'Goblin 1');
    setInputValue(maxHpInput, '15');
    setInputValue(acInput, '12');

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

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
    await act(async () => {
      root.render(<CharacterCreateForm onCreate={onCreate} />);
    });

    const form = container.querySelector('form');
    const nameInput = container.querySelector('#character-name');
    const maxHpInput = container.querySelector('#character-max-hp');
    const acInput = container.querySelector('#character-ac');

    setInputValue(nameInput, 'Hero');
    setInputValue(maxHpInput, '20');
    setInputValue(acInput, '15');

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toMatch(/already have a character/i);

    expect(nameInput.value).toBe('Hero');
    expect(maxHpInput.value).toBe('20');
    expect(acInput.value).toBe('15');
  });
});
