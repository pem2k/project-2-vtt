import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Board from '../Board.jsx';
import { createBoardHarness } from './helpers/boardHarness.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-konva', async () => {
  const { boardKonvaMock } = await import('./helpers/boardKonvaMock.jsx');
  return boardKonvaMock;
});

describe('Board component - empty state, tokens, and permissions', () => {
  let harness;

  beforeEach(() => {
    harness = createBoardHarness();
  });

  afterEach(async () => {
    if (harness) {
      await harness.cleanup();
      harness = null;
    }
  });

  it('renders empty fallback when activeMapUrl is not provided', () => {
    const markup = renderToStaticMarkup(<Board activeMapUrl={null} />);
    expect(markup).toContain('board-empty');
    expect(markup).toContain('No map active. Ask the DM to upload a map.');
  });

  it('renders tokens at (x + 0.5) * cellSize with their names', () => {
    const tokens = [
      { id: 't1', name: 'Aria', color: '#4363D8', x: 2, y: 3 },
      { id: 't2', name: 'Goblin Scout', color: '#E6194B', x: 5, y: 5 },
    ];

    const markup = renderToStaticMarkup(
      <Board
        activeMapUrl="https://example.com/map.png"
        width={800}
        height={600}
        cellSize={50}
        tokens={tokens}
      />,
    );

    // Both names should be rendered
    expect(markup).toContain('Aria');
    expect(markup).toContain('Goblin Scout');

    // Check pixel calculations: (2 + 0.5) * 50 = 125, (3 + 0.5) * 50 = 175
    expect(markup).toContain('data-x="125"');
    expect(markup).toContain('data-y="175"');

    // Check pixel calculations: (5 + 0.5) * 50 = 275, (5 + 0.5) * 50 = 275
    expect(markup).toContain('data-x="275"');
    expect(markup).toContain('data-y="275"');
  });

  it('forwards drag permissions and movement callback to tokens', async () => {
    const onMoveToken = vi.fn();
    const tokens = [
      { id: 't1', name: 'Aria', x: 2, y: 3, assigned_to: 'user-player' },
      { id: 't2', name: 'Goblin', x: 5, y: 5, assigned_to: null },
    ];

    await harness.render({
      tokens,
      currentUserId: 'user-player',
      isDm: false,
      isSocketReady: true,
      onMoveToken,
    });

    const tokenEls = harness.container.querySelectorAll('[data-testid="token-group"]');
    expect(tokenEls).toHaveLength(2);
    // Player can drag Aria, but not Goblin
    expect(tokenEls[0].getAttribute('data-draggable')).toBe('true');
    expect(tokenEls[1].getAttribute('data-draggable')).toBe('false');

    // Trigger drag-end callback on the draggable token and verify onMoveToken is invoked
    await act(async () => {
      tokenEls[0].click();
    });
    expect(onMoveToken).toHaveBeenCalledTimes(1);
    expect(onMoveToken).toHaveBeenCalledWith(tokens[0], 2, 3, expect.any(Function));

    // Verify pending tokens are rendered non-draggable
    await harness.render({
      tokens,
      currentUserId: 'user-player',
      isDm: false,
      isSocketReady: true,
      pendingTokenIds: new Set(['t1']),
      onMoveToken,
    });
    const updatedTokenEls = harness.container.querySelectorAll('[data-testid="token-group"]');
    expect(updatedTokenEls[0].getAttribute('data-draggable')).toBe('false');
  });
});
