import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import ChatPanel from './ChatPanel.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const rolls = [
  { id: 'roll-1', playerName: 'Aria', die: 'd20', result: 17, at: 200 },
  { id: 'roll-2', playerName: 'Borin', die: 'd8', result: 4, at: 100 },
];

describe('ChatPanel rolls', () => {
  it('shows each roll in the message list with the roller name', () => {
    const markup = renderToStaticMarkup(<ChatPanel rolls={rolls} />);

    expect(markup).toContain('Aria rolled d20: 17');
    expect(markup).toContain('Borin rolled d8: 4');
  });

  it('shows custom dice notation with individual rolls and total', () => {
    const notationRolls = [
      {
        id: 'roll-3',
        playerName: 'Aria',
        notation: '2d6+5',
        rolls: [4, 5],
        modifier: 5,
        total: 14,
        at: 300,
      },
    ];
    const markup = renderToStaticMarkup(<ChatPanel rolls={notationRolls} />);

    expect(markup).toContain('Aria rolled 2d6+5: 14 (4, 5 + 5)');
  });

  it('shows the empty state only when there are no messages and no rolls', () => {
    const empty = renderToStaticMarkup(<ChatPanel />);
    expect(empty).toContain('No messages yet.');

    const withRolls = renderToStaticMarkup(<ChatPanel rolls={rolls} />);
    expect(withRolls).not.toContain('No messages yet.');
  });
});

describe('ChatPanel slash command input', () => {
  let originalScrollIntoView;
  let container = null;
  let root = null;

  beforeEach(() => {
    originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    try {
      if (root) {
        act(() => {
          root.unmount();
        });
        root = null;
      }
    } finally {
      try {
        if (container?.parentNode) {
          container.parentNode.removeChild(container);
          container = null;
        }
      } finally {
        if (originalScrollIntoView !== undefined) {
          window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        } else {
          delete window.HTMLElement.prototype.scrollIntoView;
        }
        vi.restoreAllMocks();
      }
    }
  });

  function setupChat(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<ChatPanel {...props} />);
    });
    const input = container.querySelector('input.chat-input-field');
    const form = container.querySelector('form.chat-input-form');

    const submitText = (text) => {
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    };

    return { div: container, root, input, submitText };
  }

  it('intercepts /roll <notation>, calls onRoll, clears input, and does not post chat message', () => {
    const onRoll = vi.fn();
    const { div, input, submitText } = setupChat({ onRoll });

    submitText('/roll 2d6+5');

    expect(onRoll).toHaveBeenCalledWith('2d6+5');
    expect(input.value).toBe('');
    expect(div.textContent).not.toContain('/roll 2d6+5');
  });

  it('intercepts /r <notation> shorthand and calls onRoll', () => {
    const onRoll = vi.fn();
    const { div, input, submitText } = setupChat({ onRoll });

    submitText('/r 1d20-2');

    expect(onRoll).toHaveBeenCalledWith('1d20-2');
    expect(input.value).toBe('');
    expect(div.textContent).not.toContain('/r 1d20-2');
  });

  it('intercepts /r<notation> without space and calls onRoll', () => {
    const onRoll = vi.fn();
    const { div, input, submitText } = setupChat({ onRoll });

    submitText('/r2d6+5');

    expect(onRoll).toHaveBeenCalledWith('2d6+5');
    expect(input.value).toBe('');
    expect(div.textContent).not.toContain('/r2d6+5');
  });

  it('silently fails for empty /roll slash command without calling onRoll or posting message', () => {
    const onRoll = vi.fn();
    const { div, input, submitText } = setupChat({ onRoll });

    submitText('/roll');

    expect(onRoll).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(div.textContent).not.toContain('/roll');
  });

  it('posts normal chat messages normally', () => {
    const onRoll = vi.fn();
    const { div, submitText } = setupChat({
      currentUser: { email: 'aria@example.com' },
      onRoll,
    });

    submitText('Hello party!');

    expect(onRoll).not.toHaveBeenCalled();
    expect(div.textContent).toContain('aria: Hello party!');
  });
});
