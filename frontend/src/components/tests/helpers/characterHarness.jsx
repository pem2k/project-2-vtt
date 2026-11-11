import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { deferred } from '../../../test/deferred.js';

export { deferred };

export function createCharacterHarness() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);

  async function render(element) {
    if (!root) {
      throw new Error(
        'Cannot render after harness has been cleaned up or unmounted without a root.',
      );
    }
    await act(async () => {
      root.render(element);
    });
    return container;
  }

  async function unmount() {
    if (root) {
      const activeRoot = root;
      root = null;
      await act(async () => {
        activeRoot.unmount();
      });
    }
  }

  async function cleanup() {
    try {
      await unmount();
    } finally {
      if (container?.parentNode) {
        container.parentNode.removeChild(container);
      }
      container = null;
      vi.restoreAllMocks();
    }
  }

  return {
    get container() {
      return container;
    },
    get root() {
      return root;
    },
    render,
    unmount,
    cleanup,
  };
}

export async function setInputValue(input, value) {
  if (!input) {
    throw new Error('Input element not found');
  }
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  if (!nativeInputValueSetter) {
    throw new Error('HTMLInputElement value setter not found');
  }
  await act(async () => {
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return input;
}

export async function submitForm(form) {
  if (!form) {
    throw new Error('Form not found');
  }
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

export function createCharacter(overrides = {}) {
  return {
    id: 'c1',
    name: 'Aria',
    hp: 10,
    max_hp: 20,
    ac: 15,
    notes: '',
    ...overrides,
  };
}
