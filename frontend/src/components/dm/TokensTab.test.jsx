import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TokensTab from './TokensTab.jsx';

describe('TokensTab component', () => {
  it('renders token form and empty state when no tokens exist', () => {
    const markup = renderToStaticMarkup(
      <TokensTab tokens={[]} members={[]} onAddToken={vi.fn()} onRemoveToken={vi.fn()} />,
    );

    // Form controls
    expect(markup).toContain('Token Name');
    expect(markup).toContain('id="token-name-input"');
    expect(markup).toContain('Token Color');
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="Token Color"');
    expect(markup).toContain('Add Token');

    // Color swatches with accessible names
    expect(markup).toContain('aria-label="Red"');
    expect(markup).toContain('aria-label="Blue"');
    expect(markup).toContain('aria-label="Green"');

    // Empty tokens state
    expect(markup).toContain('No tokens on board.');
  });

  it('renders token list items with assignment dropdown and remove buttons', () => {
    const tokens = [
      { id: 't-1', name: 'Goblin Scout', color: '#E6194B', assigned_to: 'user-dm' },
      { id: 't-2', name: 'Aria', color: '#4363D8', assigned_to: null },
      { id: 't-3', name: 'Ghost', color: '#FFFFFF', assigned_to: 'unknown-id' },
    ];

    const members = [
      { user_id: 'user-dm', role: 'dm', display_name: 'DungeonMaster' },
      { user_id: 'user-p1', role: 'player', display_name: 'PlayerOne' },
    ];

    const markup = renderToStaticMarkup(
      <TokensTab
        tokens={tokens}
        members={members}
        onAddToken={vi.fn()}
        onRemoveToken={vi.fn()}
        onAssignToken={vi.fn()}
      />,
    );

    // Token names and remove buttons
    expect(markup).toContain('Goblin Scout');
    expect(markup).toContain('aria-label="Remove Goblin Scout"');
    expect(markup).toContain('Aria');
    expect(markup).toContain('aria-label="Remove Aria"');

    // Dropdown labels and options
    expect(markup).toContain('aria-label="Assign Goblin Scout"');
    expect(markup).toContain('Unassigned');
    expect(markup).toContain('DungeonMaster (DM)');
    expect(markup).toContain('PlayerOne');
    expect(markup).toContain('Unknown player');

    // Selected option for assigned token
    expect(markup).toMatch(/<option[^>]*value="user-dm"[^>]*selected/);
  });
});
