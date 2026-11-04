import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DMControls from './DMControls.jsx';

describe('DMControls tokens tab', () => {
  it('renders the tokens form and token list with accessible controls', () => {
    const tokens = [
      { id: 'token-1', name: 'Goblin Scout', color: '#E6194B' },
      { id: 'token-2', name: 'Aria', color: '#4363D8' },
    ];

    const markup = renderToStaticMarkup(
      <DMControls
        isOpen={true}
        initialTab="tokens"
        tokens={tokens}
        onAddToken={vi.fn()}
        onRemoveToken={vi.fn()}
      />,
    );

    // Form and inputs
    expect(markup).toContain('Token Name');
    expect(markup).toContain('id="token-name-input"');
    expect(markup).toContain('Add Token');

    // Palette swatches with accessible color names
    expect(markup).toContain('aria-label="Red"');
    expect(markup).toContain('aria-label="Blue"');
    expect(markup).toContain('aria-label="Green"');

    // Token list items and remove buttons
    expect(markup).toContain('Goblin Scout');
    expect(markup).toContain('aria-label="Remove Goblin Scout"');
    expect(markup).toContain('Aria');
    expect(markup).toContain('aria-label="Remove Aria"');
  });

  it('renders assignment dropdown for each token with members, DM suffix, and correct selection', () => {
    const tokens = [
      { id: 'token-1', name: 'Goblin Scout', color: '#E6194B', assigned_to: 'user-dm' },
      { id: 'token-2', name: 'Aria', color: '#4363D8', assigned_to: null },
      { id: 'token-3', name: 'Ghost', color: '#FFFFFF', assigned_to: 'unknown-id' },
    ];

    const members = [
      { user_id: 'user-dm', role: 'dm', display_name: 'DungeonMaster' },
      { user_id: 'user-p1', role: 'player', display_name: 'PlayerOne' },
    ];

    const onRefreshMembers = vi.fn();
    const onAssignToken = vi.fn();

    const markup = renderToStaticMarkup(
      <DMControls
        isOpen={true}
        initialTab="tokens"
        tokens={tokens}
        members={members}
        onAssignToken={onAssignToken}
        onRefreshMembers={onRefreshMembers}
      />,
    );

    // Dropdown labels
    expect(markup).toContain('aria-label="Assign Goblin Scout"');
    expect(markup).toContain('aria-label="Assign Aria"');
    expect(markup).toContain('aria-label="Assign Ghost"');

    // Options
    expect(markup).toContain('Unassigned');
    expect(markup).toContain('DungeonMaster (DM)');
    expect(markup).toContain('PlayerOne');
    // Stale unknown player option
    expect(markup).toContain('Unknown player');

    // Selection check
    expect(markup).toMatch(/<option[^>]*value="user-dm"[^>]*selected/);
  });
});
