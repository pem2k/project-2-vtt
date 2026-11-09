import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChatPanel from './ChatPanel.jsx';

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

  it('shows the empty state only when there are no messages and no rolls', () => {
    const empty = renderToStaticMarkup(<ChatPanel />);
    expect(empty).toContain('No messages yet.');

    const withRolls = renderToStaticMarkup(<ChatPanel rolls={rolls} />);
    expect(withRolls).not.toContain('No messages yet.');
  });
});
