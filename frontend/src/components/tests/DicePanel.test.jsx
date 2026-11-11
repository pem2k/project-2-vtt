import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DicePanel from '../DicePanel.jsx';

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

function buttonTags(markup) {
  return markup.match(/<button\b[^>]*>/gi) ?? [];
}

describe('DicePanel', () => {
  it('shows a button with an accessible name for each standard die', () => {
    const markup = renderToStaticMarkup(<DicePanel onRoll={vi.fn()} disabled={false} />);

    const buttons = buttonTags(markup);
    expect(buttons).toHaveLength(DICE.length);

    for (const die of DICE) {
      const button = buttons.find((tag) => tag.includes(`aria-label="Roll ${die}"`));
      expect(button).toBeTruthy();
      expect(button).toContain('type="button"');
      expect(button).not.toMatch(/\sdisabled(\s|=|>)/);
      expect(markup).toContain(`>${die}<`);
    }
  });

  it('disables every die button when disabled is set', () => {
    const markup = renderToStaticMarkup(<DicePanel onRoll={vi.fn()} disabled />);

    const buttons = buttonTags(markup);
    expect(buttons).toHaveLength(DICE.length);
    for (const button of buttons) {
      expect(button).toMatch(/\sdisabled(\s|=|>)/);
    }
  });
});
