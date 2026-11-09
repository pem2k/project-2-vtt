import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CharacterCard from './CharacterCard.jsx';

describe('CharacterCard display', () => {
  it('renders name, HP, AC, and notes for an existing character', () => {
    const character = {
      id: 'c1',
      name: 'Aria Shadowmend',
      hp: 7,
      max_hp: 12,
      ac: 15,
      notes: 'Has a cursed amulet',
    };

    const markup = renderToStaticMarkup(<CharacterCard character={character} />);

    expect(markup).toContain('Aria Shadowmend');
    expect(markup).toContain('HP');
    expect(markup).toContain('7');
    expect(markup).toContain('12');
    expect(markup).toContain('15');
    expect(markup).toContain('Has a cursed amulet');
  });

  it('shows a placeholder when notes are empty', () => {
    const character = {
      id: 'c2',
      name: 'Gobbo',
      hp: 10,
      max_hp: 10,
      ac: 10,
      notes: '',
    };

    const markup = renderToStaticMarkup(<CharacterCard character={character} />);

    expect(markup).toContain('Gobbo');
    // Should show some placeholder text for empty notes
    expect(markup).toMatch(/no notes|none/i);
  });

  it('does not render edit inputs for HP, notes, or AC in the display card', () => {
    const character = {
      id: 'c3',
      name: 'Tank',
      hp: 20,
      max_hp: 20,
      ac: 18,
      notes: 'Frontline fighter',
    };

    const markup = renderToStaticMarkup(<CharacterCard character={character} />);

    // No input or textarea elements should be present in display mode
    expect(markup).not.toMatch(/<input/);
    expect(markup).not.toMatch(/<textarea/);
  });

  it('renders a create form when no character exists', () => {
    const onCreate = vi.fn();

    const markup = renderToStaticMarkup(<CharacterCard character={null} onCreate={onCreate} />);

    // Form should have labeled inputs for name, max HP, and AC
    expect(markup).toMatch(/name/i);
    expect(markup).toMatch(/max hp/i);
    expect(markup).toMatch(/ac|armor class/i);
    expect(markup).toMatch(/<input/);
    // Should have a submit/create button
    expect(markup).toMatch(/<button/);
  });
});

describe('CharacterCard DM view', () => {
  it('shows a selector for DM to pick among multiple characters', () => {
    const characters = [
      { id: 'c1', name: 'Aria', hp: 12, max_hp: 12, ac: 15, notes: '' },
      { id: 'c2', name: 'Gobbo', hp: 7, max_hp: 10, ac: 10, notes: 'sneaky' },
      { id: 'c3', name: 'Tank', hp: 20, max_hp: 20, ac: 18, notes: '' },
    ];

    const markup = renderToStaticMarkup(
      <CharacterCard character={characters[0]} characters={characters} isDM={true} />,
    );

    // DM should see a select/dropdown to pick which character to view
    expect(markup).toMatch(/<select/);
    expect(markup).toContain('Aria');
    expect(markup).toContain('Gobbo');
    expect(markup).toContain('Tank');
  });

  it('does not show a character selector for a player', () => {
    const character = {
      id: 'c1',
      name: 'Aria',
      hp: 12,
      max_hp: 12,
      ac: 15,
      notes: '',
    };

    const markup = renderToStaticMarkup(<CharacterCard character={character} isDM={false} />);

    // Player should NOT see a select dropdown
    expect(markup).not.toMatch(/<select/);
  });
});
