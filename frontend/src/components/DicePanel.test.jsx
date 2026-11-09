import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DicePanel from './DicePanel.jsx';

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

function buttonTags(markup) {
  return markup.match(/<button\b[^>]*>/gi) ?? [];
}

describe('DicePanel', () => {
  it('shows a button with an accessible name for each standard die', () => {
    const markup = renderToStaticMarkup(<DicePanel rolls={[]} onRoll={vi.fn()} disabled={false} />);

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

  it('shows each roll as "<name> rolled <die>: <result>"', () => {
    const markup = renderToStaticMarkup(
      <DicePanel
        rolls={[
          { playerName: 'Aria', die: 'd20', result: 17 },
          { playerName: 'Borin', die: 'd8', result: 4 },
        ]}
        onRoll={vi.fn()}
      />,
    );

    expect(markup).toContain('Aria rolled d20: 17');
    expect(markup).toContain('Borin rolled d8: 4');
    expect(markup).toMatch(/<(ul|ol)\b/);
    expect(markup).not.toContain('No rolls yet.');
  });

  it('shows an empty-state message when there are no rolls', () => {
    const markup = renderToStaticMarkup(<DicePanel rolls={[]} onRoll={vi.fn()} />);

    expect(markup).toContain('No rolls yet.');
    expect(markup).not.toContain('rolled');
  });

  it('disables every die button when disabled is set', () => {
    const markup = renderToStaticMarkup(<DicePanel rolls={[]} onRoll={vi.fn()} disabled />);

    const buttons = buttonTags(markup);
    expect(buttons).toHaveLength(DICE.length);
    for (const button of buttons) {
      expect(button).toMatch(/\sdisabled(\s|=|>)/);
    }
  });
});
