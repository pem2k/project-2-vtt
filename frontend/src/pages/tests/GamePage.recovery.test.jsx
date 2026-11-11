import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tokensLib from '../../lib/tokens.js';
import * as mapsLib from '../../lib/maps.js';
import * as charactersLib from '../../lib/characters.js';
import { createGamePageHarness, deferred } from '../../test/gamePageHarness.jsx';

let latestDMProps = {};
vi.mock('../../components/DMControls.jsx', () => ({
  default: (props) => {
    latestDMProps = props;
    return <div data-testid="dm-controls" />;
  },
}));

vi.mock('../../components/board/Board.jsx', () => ({
  default: ({ tokens = [], activeMapUrl }) => (
    <div data-testid="board" data-map-url={activeMapUrl}>
      {tokens.map((t) => (
        <span key={t.id} data-testid={`token-${t.id}`} data-x={t.x} data-y={t.y}>
          {t.name}
        </span>
      ))}
    </div>
  ),
}));

vi.mock('../../components/ChatPanel.jsx', () => ({
  default: () => <div data-testid="chat-panel" />,
}));

describe('GamePage board snapshot and reconnect recovery', () => {
  let harness;

  beforeEach(() => {
    latestDMProps = {};
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

  it('preserves existing board state on reconnect recovery failure and clears error on retry success', async () => {
    harness.setupMockRoomSocket();

    harness.mockAuthenticatedGame({
      roomName: 'Baldurs Gate',
      activeMap: { id: 'm1', url: 'https://m1.png' },
    });

    // Initial load succeeds with token Aria
    vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValueOnce([
      { id: 't1', name: 'Aria', x: 5, y: 5 },
    ]);

    await harness.render('/game/room-123');

    expect(harness.container.querySelector('[data-testid="token-t1"]')).not.toBeNull();
    expect(harness.container.querySelector('[role="alert"]')).toBeNull();

    // 1. Reconnect recovery fails:
    vi.spyOn(tokensLib, 'getRoomTokens').mockRejectedValueOnce(
      new Error('Network drop during token recovery'),
    );

    await act(async () => {
      await harness.triggerOnJoined('room-123');
    });

    // Board state must be PRESERVED (token-t1 still on the board):
    expect(harness.container.querySelector('[data-testid="token-t1"]')).not.toBeNull();
    // Useful error must be displayed:
    const alertEl = harness.container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl.textContent).toContain('Network drop during token recovery');

    // 2. Successful retry clears the error:
    vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValueOnce([
      { id: 't1', name: 'Aria', x: 5, y: 5 },
      { id: 't2', name: 'Bruenor', x: 10, y: 10 },
    ]);

    await act(async () => {
      await harness.triggerOnJoined('room-123');
    });

    // Error alert must be cleared:
    expect(harness.container.querySelector('[role="alert"]')).toBeNull();
    expect(harness.container.querySelector('[data-testid="token-t2"]')).not.toBeNull();
  });

  it('recovers missed updates and prevents in-flight snapshot from overwriting newer socket events', async () => {
    harness.setupMockRoomSocket();

    harness.mockAuthenticatedGame({
      roomName: 'The Underdark',
      activeMap: { id: 'map-1', url: 'https://map.png' },
    });

    const snapshot = deferred();
    vi.spyOn(tokensLib, 'getRoomTokens').mockImplementation(() => snapshot.promise);

    await harness.render('/game/room-123');

    // While getRoomTokens snapshot is in-flight, a newer token update arrives via socket:
    await act(async () => {
      harness.triggerSocket('tokenUpdated', {
        id: 't1',
        name: 'Aria',
        color: '#4363D8',
        x: 42,
        y: 84,
      });
    });

    // The older snapshot resolves with old position x: 0, y: 0
    await act(async () => {
      snapshot.resolve([{ id: 't1', name: 'Aria', color: '#4363D8', x: 0, y: 0 }]);
      await snapshot.promise;
    });

    // Verify token on the board preserved x: 42, y: 84 and was not overwritten by x: 0, y: 0
    const tokenEl = harness.container.querySelector('[data-testid="token-t1"]');
    expect(tokenEl).not.toBeNull();
    expect(tokenEl.getAttribute('data-x')).toBe('42');
    expect(tokenEl.getAttribute('data-y')).toBe('84');
  });

  it('preserves local token actions and map selections during snapshot recovery', async () => {
    harness.setupMockRoomSocket();

    harness.mockAuthenticatedGame({
      userId: 'dm-1',
      role: 'dm',
      roomName: 'Sword Coast',
    });

    const tokensDeferred = deferred();
    vi.spyOn(tokensLib, 'getRoomTokens').mockImplementation(() => tokensDeferred.promise);

    const mapDeferred = deferred();
    vi.spyOn(mapsLib, 'getActiveMap').mockImplementation(() => mapDeferred.promise);

    vi.spyOn(tokensLib, 'addToken').mockResolvedValue({
      id: 'local-token-1',
      name: 'Drizzt',
      color: '#3CB44B',
      x: 0,
      y: 0,
    });

    await harness.render('/game/room-123');

    // While snapshots are in-flight, execute local token add and local map selection:
    expect(latestDMProps.onAddToken).toEqual(expect.any(Function));
    expect(latestDMProps.onSelectActiveMap).toEqual(expect.any(Function));
    await act(async () => {
      await latestDMProps.onAddToken('Drizzt', '#3CB44B');
      latestDMProps.onSelectActiveMap({ id: 'map-new', url: 'https://new-map.png' });
    });

    // Now resolve the older database snapshot:
    await act(async () => {
      tokensDeferred.resolve([{ id: 'old-token-1', name: 'Aria', color: '#4363D8', x: 1, y: 1 }]);
      mapDeferred.resolve({ id: 'map-old', url: 'https://old-map.png' });
      await tokensDeferred.promise;
      await mapDeferred.promise;
    });

    // Verify local token 'Drizzt' is preserved alongside the snapshot
    const addedTokenEl = harness.container.querySelector('[data-testid="token-local-token-1"]');
    expect(addedTokenEl).not.toBeNull();
    expect(addedTokenEl.textContent).toBe('Drizzt');

    // Verify local map selection 'https://new-map.png' is preserved and not overwritten by 'https://old-map.png'
    const boardEl = harness.container.querySelector('[data-testid="board"]');
    expect(boardEl.getAttribute('data-map-url')).toBe('https://new-map.png');
  });

  it('discards independently delayed snapshots when a newer join supersedes them', async () => {
    harness.setupMockRoomSocket();

    harness.mockAuthenticatedGame({
      roomName: 'Neverwinter',
      activeMap: { id: 'm1', url: 'https://m1.png' },
    });

    const initialTokens = deferred();
    const staleTokens = deferred();
    const freshTokens = deferred();

    vi.spyOn(tokensLib, 'getRoomTokens')
      .mockImplementationOnce(() => initialTokens.promise)
      .mockImplementationOnce(() => staleTokens.promise)
      .mockImplementationOnce(() => freshTokens.promise);

    // Initial mount calls loadRoomState() which consumes initialTokens.promise
    await harness.render('/game/room-123');

    // Complete initial loading
    await act(async () => {
      initialTokens.resolve([{ id: 'tok-init', name: 'Initial Token', x: 0, y: 0 }]);
      await initialTokens.promise;
    });

    expect(harness.container.querySelector('[data-testid="token-tok-init"]')).not.toBeNull();

    // 1. Reconnect triggers recovery (sync 1, staleTokens.promise)
    await act(async () => {
      harness.triggerOnJoined('room-123');
    });

    // 2. A rapid second reconnect triggers a newer recovery (sync 2, freshTokens.promise) before sync 1 resolves
    await act(async () => {
      harness.triggerOnJoined('room-123');
    });

    // 3. Newer recovery resolves with fresh token:
    await act(async () => {
      freshTokens.resolve([
        { id: 'tok-fresh', name: 'Fresh Token', color: '#E6194B', x: 10, y: 10 },
      ]);
      await freshTokens.promise;
    });

    // Verify fresh token is displayed
    expect(harness.container.querySelector('[data-testid="token-tok-fresh"]')).not.toBeNull();

    // 4. Stale recovery resolves late with outdated tokens:
    await act(async () => {
      staleTokens.resolve([{ id: 'tok-stale', name: 'Stale Token', color: '#000000', x: 0, y: 0 }]);
      await staleTokens.promise;
    });

    // Outdated stale token must be discarded and NOT overwrite fresh token
    expect(harness.container.querySelector('[data-testid="token-tok-stale"]')).toBeNull();
    expect(harness.container.querySelector('[data-testid="token-tok-fresh"]')).not.toBeNull();
  });

  it('prevents old room member lookup resolution from starting an additional snapshot after navigating to a new room', async () => {
    harness.setupMockRoomSocket();

    const roomAMembers = deferred();

    harness.mockAuthenticatedGame({
      roomName: (rid) => (rid === 'room-a' ? 'Room Alpha' : 'Room Beta'),
      members: (rid) => (rid === 'room-a' ? roomAMembers.promise : Promise.resolve([])),
    });

    const getRoomTokensSpy = vi
      .spyOn(tokensLib, 'getRoomTokens')
      .mockImplementation(async (_sb, roomId) => {
        if (roomId === 'room-b') {
          return [{ id: 'tok-b', name: 'Token Beta', color: '#E6194B', x: 2, y: 2 }];
        }
        return [{ id: 'tok-a', name: 'Token Alpha', color: '#4363D8', x: 1, y: 1 }];
      });

    // 1. Start loading room A (pauses at getRoomMembers)
    await harness.render('/game/room-a');

    // Room A member lookup is paused, so Room A has NOT started any token snapshot
    expect(getRoomTokensSpy).not.toHaveBeenCalledWith(expect.anything(), 'room-a');

    // 2. Navigate to room B and start B's snapshot
    await harness.navigate('/game/room-b');

    // Verify Room B's snapshot was requested
    expect(getRoomTokensSpy).toHaveBeenCalledWith(expect.anything(), 'room-b');

    // 3. Resolve room A's member lookup
    await act(async () => {
      roomAMembers.resolve([{ user_id: 'dm-1', role: 'dm', display_name: 'DM' }]);
      await roomAMembers.promise;
    });

    // 4. Verify room A started no additional snapshot and room B's snapshot still applies successfully
    expect(getRoomTokensSpy).not.toHaveBeenCalledWith(expect.anything(), 'room-a');
    expect(harness.container.querySelector('[data-testid="token-tok-b"]')).not.toBeNull();
    expect(harness.container.querySelector('[data-testid="token-tok-b"]').textContent).toBe(
      'Token Beta',
    );
    expect(harness.container.querySelector('[data-testid="token-tok-a"]')).toBeNull();
  });
});
