import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tokensLib from '../../lib/tokens.js';
import * as charactersLib from '../../lib/characters.js';
import { createGamePageHarness, deferred } from '../../test/gamePageHarness.jsx';

vi.mock('../../components/board/Board.jsx', () => ({
  default: () => <div data-testid="board" />,
}));

vi.mock('../../components/ChatPanel.jsx', () => ({
  default: () => (
    <div data-testid="chat-panel">
      <input aria-label="Chat message input" readOnly />
    </div>
  ),
}));

describe('GamePage page composition and initial loading', () => {
  let harness;

  beforeEach(() => {
    harness = createGamePageHarness();
    vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);
    vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);
  });

  afterEach(async () => {
    if (harness) {
      await harness.cleanup();
      harness = null;
    }
  });

  it('keeps loading active while initial snapshot is delayed, only showing board once resolved', async () => {
    harness.setupMockRoomSocket({ socket: null, isReady: false });

    harness.mockAuthenticatedGame({
      activeMap: { id: 'map-1', url: 'https://map.png' },
    });

    const snapshot = deferred();
    vi.spyOn(tokensLib, 'getRoomTokens').mockImplementation(() => snapshot.promise);

    await harness.render('/game/room-123');

    // Loading indicator must be visible while snapshot is delayed
    expect(harness.container.textContent).toContain('Loading game room...');
    expect(harness.container.querySelector('[data-testid="board"]')).toBeNull();

    // Resolve snapshot
    await act(async () => {
      snapshot.resolve([{ id: 't1', name: 'Aria', x: 0, y: 0 }]);
      await snapshot.promise;
    });

    // Loading indicator cleared and board rendered
    expect(harness.container.textContent).not.toContain('Loading game room...');
    expect(harness.container.querySelector('[data-testid="board"]')).not.toBeNull();
  });

  it('ends loading and shows useful error when initial snapshot fails', async () => {
    harness.setupMockRoomSocket({ socket: null, isReady: false });

    harness.mockAuthenticatedGame();
    vi.spyOn(tokensLib, 'getRoomTokens').mockRejectedValue(
      new Error('Failed to load room tokens from Supabase'),
    );

    await harness.render('/game/room-123');

    // Loading ends and recovery error alert is shown
    expect(harness.container.textContent).not.toContain('Loading game room...');
    const alertEl = harness.container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl.textContent).toContain('Failed to load room tokens from Supabase');
  });
});
