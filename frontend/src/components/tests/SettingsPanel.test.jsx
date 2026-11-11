import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../SettingsPanel.jsx';

describe('SettingsPanel role-aware tabs and accessibility (#55)', () => {
  it('renders only the Character tab for players and omits DM tabs', () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel isOpen={true} isDM={false} initialTab="character" />,
    );

    // Visible title and accessible labels
    expect(markup).toContain('<h2>Settings</h2>');
    expect(markup).toContain('aria-label="Settings Panel"');
    expect(markup).toContain('aria-label="Close Settings"');

    // Only Character tab button is rendered
    expect(markup).toContain('Character');
    expect(markup).not.toContain('>Users<');
    expect(markup).not.toContain('>Maps<');
    expect(markup).not.toContain('>Tokens<');

    // DM tab contents are not mounted in markup
    expect(markup).not.toContain('dm-maps-tab');
    expect(markup).not.toContain('dm-tokens-tab');
    expect(markup).not.toContain('dm-users-tab');
  });

  it('renders Character, Users, Maps, and Tokens tabs for DMs', () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel isOpen={true} isDM={true} initialTab="character" />,
    );

    expect(markup).toContain('>Character<');
    expect(markup).toContain('>Users<');
    expect(markup).toContain('>Maps<');
    expect(markup).toContain('>Tokens<');
  });
});

describe('SettingsPanel tokens tab for DM', () => {
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
      <SettingsPanel
        isOpen={true}
        isDM={true}
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
