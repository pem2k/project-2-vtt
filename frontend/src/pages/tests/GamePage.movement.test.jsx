import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tokensLib from '../../lib/tokens.js';
import * as charactersLib from '../../lib/characters.js';
import { createGamePageHarness, deferred } from '../../test/gamePageHarness.jsx';

let latestBoardProps = {};
vi.mock('../../components/board/Board.jsx', () => ({
  default: (props) => {
    latestBoardProps = props;
    const { tokens = [] } = props;
    return (
      <div data-testid="board">
        {tokens.map((t) => (
          <span key={t.id} data-testid={`token-${t.id}`} data-x={t.x} data-y={t.y}>
            {t.name}
          </span>
        ))}
      </div>
    );
  },
}));

vi.mock('../../components/ChatPanel.jsx', () => ({
  default: () => <div data-testid="chat-panel" />,
}));

function createToken(overrides = {}) {
  return {
    id: 'tok-1',
    name: 'Aria',
    x: 1,
    y: 1,
    ...overrides,
  };
}

describe('GamePage token movement and drag integration', () => {
  let harness;

  beforeEach(() => {
    latestBoardProps = {};
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

  function setupMovementTest({
    userId = 'dm-1',
    role = 'dm',
    roomName = 'Sword Coast',
    initialTokens = [createToken()],
    activeMap = null,
  } = {}) {
    harness.setupMockRoomSocket();

    harness.mockAuthenticatedGame({ userId, role, roomName, activeMap });

    if (typeof initialTokens === 'function') {
      vi.spyOn(tokensLib, 'getRoomTokens').mockImplementation(async (_sb, rid) =>
        initialTokens(rid),
      );
    } else if (initialTokens && typeof initialTokens.then === 'function') {
      vi.spyOn(tokensLib, 'getRoomTokens').mockImplementation(() => initialTokens);
    } else if (initialTokens) {
      vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValue(initialTokens);
    }

    vi.spyOn(tokensLib, 'emitMoveToken').mockResolvedValue();
  }

  function setupTwoRoomMovement({
    room1Coords = { x: 1, y: 1 },
    room2Coords = { x: 10, y: 10 },
    ...options
  } = {}) {
    setupMovementTest({
      roomName: (id) => (id === 'room-1' ? 'Room 1' : 'Room 2'),
      initialTokens: (rid) => [createToken(rid === 'room-1' ? room1Coords : room2Coords)],
      ...options,
    });
  }

  async function startMoveToken(token = createToken(), x, y, revert = vi.fn()) {
    let promise;
    await act(async () => {
      promise = latestBoardProps.onMoveToken(token, x, y, revert);
    });
    return { promise };
  }

  async function moveTokenTo(token = createToken(), x, y, revert = vi.fn()) {
    await act(async () => {
      await latestBoardProps.onMoveToken(token, x, y, revert);
    });
  }

  it('persists movement via moveToken and emits socket moveToken notification on success', async () => {
    setupMovementTest({
      userId: 'dm-1',
      role: 'dm',
    });

    const moveTokenSpy = vi
      .spyOn(tokensLib, 'moveToken')
      .mockResolvedValue(createToken({ x: 5, y: 6 }));

    await harness.render('/game/room-123');

    const revert = vi.fn();
    await moveTokenTo(createToken(), 5, 6, revert);

    expect(moveTokenSpy).toHaveBeenCalledWith(expect.anything(), {
      tokenId: 'tok-1',
      x: 5,
      y: 6,
    });
    expect(tokensLib.emitMoveToken).toHaveBeenCalledWith(harness.mockSocket, {
      roomId: 'room-123',
      tokenId: 'tok-1',
    });
    expect(revert).not.toHaveBeenCalled();

    const tokenEl = harness.container.querySelector('[data-testid="token-tok-1"]');
    expect(tokenEl.getAttribute('data-x')).toBe('5');
    expect(tokenEl.getAttribute('data-y')).toBe('6');
    expect(harness.container.querySelector('[role="alert"]')).toBeNull();
  });

  it('reverts position and displays error if move persistence fails', async () => {
    setupMovementTest({
      userId: 'player-1',
      role: 'player',
    });

    vi.spyOn(tokensLib, 'moveToken').mockRejectedValue(
      new Error('Permission denied to move token.'),
    );

    await harness.render('/game/room-123');

    const revert = vi.fn();
    await moveTokenTo(createToken(), 5, 6, revert);

    expect(revert).toHaveBeenCalledTimes(1);
    expect(tokensLib.emitMoveToken).not.toHaveBeenCalled();

    const alertEl = harness.container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl.textContent).toContain('Permission denied to move token.');

    // Token in state remains at previous position
    const tokenEl = harness.container.querySelector('[data-testid="token-tok-1"]');
    expect(tokenEl.getAttribute('data-x')).toBe('1');
    expect(tokenEl.getAttribute('data-y')).toBe('1');
  });

  it('preserves saved position and shows sync warning when socket notification fails', async () => {
    setupMovementTest({
      userId: 'dm-1',
      role: 'dm',
    });

    vi.spyOn(tokensLib, 'moveToken').mockResolvedValue(createToken({ x: 8, y: 9 }));
    vi.spyOn(tokensLib, 'emitMoveToken').mockRejectedValue(
      new Error('Socket notification timeout'),
    );

    await harness.render('/game/room-123');

    const revert = vi.fn();
    await moveTokenTo(createToken(), 8, 9, revert);

    // Must NOT revert because persistence succeeded
    expect(revert).not.toHaveBeenCalled();

    // State is updated with persisted coordinates
    const tokenEl = harness.container.querySelector('[data-testid="token-tok-1"]');
    expect(tokenEl.getAttribute('data-x')).toBe('8');
    expect(tokenEl.getAttribute('data-y')).toBe('9');

    // User alert displays synchronization failure
    const alertEl = harness.container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl.textContent).toBe(
      'Token position saved, but failed to sync move with other players.',
    );
  });

  it('updates token position on remote tokenMoved socket event and cleans up listener on unmount', async () => {
    setupMovementTest({
      userId: 'player-1',
      role: 'player',
    });

    await harness.render('/game/room-123');
    expect(harness.socketListeners.has('tokenMoved')).toBe(true);

    // Remote member moves token
    await act(async () => {
      harness.triggerSocket('tokenMoved', {
        id: 'tok-1',
        name: 'Aria',
        x: 10,
        y: 12,
      });
    });

    const tokenEl = harness.container.querySelector('[data-testid="token-tok-1"]');
    expect(tokenEl.getAttribute('data-x')).toBe('10');
    expect(tokenEl.getAttribute('data-y')).toBe('12');

    // Unmount cleans up socket listener
    await act(async () => {
      harness.root.unmount();
    });

    expect(harness.mockSocket.off).toHaveBeenCalledWith('tokenMoved', expect.any(Function));
    expect(harness.socketListeners.has('tokenMoved')).toBe(false);
  });

  it('buffers tokenMoved events during in-flight snapshot reload so older snapshot does not revert movement', async () => {
    setupMovementTest({
      roomName: 'The Underdark',
      activeMap: { id: 'map-1', url: 'https://map.png' },
      initialTokens: null,
    });

    const initialTokens = deferred();
    const reconnectTokens = deferred();
    vi.spyOn(tokensLib, 'getRoomTokens')
      .mockImplementationOnce(() => initialTokens.promise)
      .mockImplementationOnce(() => reconnectTokens.promise);

    await harness.render('/game/room-123');

    await act(async () => {
      initialTokens.resolve([{ id: 't1', name: 'Aria', color: '#4363D8', x: 0, y: 0 }]);
      await initialTokens.promise;
    });

    expect(harness.container.querySelector('[data-testid="token-t1"]').getAttribute('data-x')).toBe(
      '0',
    );

    let reconnectPromise;
    await act(async () => {
      reconnectPromise = harness.triggerOnJoined('room-123');
    });

    // While snapshot in-flight, remote tokenMoved arrives with new position
    await act(async () => {
      harness.triggerSocket('tokenMoved', {
        id: 't1',
        name: 'Aria',
        color: '#4363D8',
        x: 42,
        y: 84,
      });
    });

    // Older reconnect snapshot resolves with old position x: 0, y: 0
    await act(async () => {
      reconnectTokens.resolve([{ id: 't1', name: 'Aria', color: '#4363D8', x: 0, y: 0 }]);
      await reconnectTokens.promise;
      await reconnectPromise;
    });

    // Token on board preserved x: 42, y: 84 and was not overwritten by x: 0, y: 0
    const tokenEl = harness.container.querySelector('[data-testid="token-t1"]');
    expect(tokenEl.getAttribute('data-x')).toBe('42');
    expect(tokenEl.getAttribute('data-y')).toBe('84');
  });

  it('prevents a second concurrent local drag/save on the same token while the first is pending', async () => {
    setupMovementTest({
      initialTokens: [createToken(), createToken({ id: 'tok-2', name: 'Gimli', x: 3, y: 3 })],
    });

    const moveDeferred1 = deferred();
    const moveDeferred2 = deferred();
    const moveTokenSpy = vi
      .spyOn(tokensLib, 'moveToken')
      .mockImplementationOnce(() => moveDeferred1.promise)
      .mockImplementationOnce(() => moveDeferred2.promise);

    await harness.render('/game/room-123');

    const revert1 = vi.fn();
    const revert2 = vi.fn();

    // Start first move on tok-1
    const { promise: move1Promise } = await startMoveToken(createToken(), 5, 5, revert1);

    // tok-1 is marked pending in Board props
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);
    expect(latestBoardProps.pendingTokenIds.has('tok-2')).toBe(false);

    // Attempt second move on the same token while first is pending
    await moveTokenTo(createToken(), 9, 9, revert2);

    // Second move must be blocked: moveToken called only once for (5, 5), not for (9, 9)
    expect(moveTokenSpy).toHaveBeenCalledTimes(1);
    expect(moveTokenSpy).toHaveBeenCalledWith(expect.anything(), {
      tokenId: 'tok-1',
      x: 5,
      y: 5,
    });

    // Other token tok-2 can move concurrently without being blocked
    const { promise: move2Promise } = await startMoveToken(
      createToken({ id: 'tok-2', name: 'Gimli', x: 3, y: 3 }),
      4,
      4,
    );
    expect(moveTokenSpy).toHaveBeenCalledTimes(2);
    expect(latestBoardProps.pendingTokenIds.has('tok-2')).toBe(true);

    // Complete first move
    await act(async () => {
      moveDeferred1.resolve(createToken({ x: 5, y: 5 }));
      await move1Promise;
    });
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

    // Complete second token move
    await act(async () => {
      moveDeferred2.resolve(createToken({ id: 'tok-2', name: 'Gimli', x: 4, y: 4 }));
      await move2Promise;
    });
    expect(latestBoardProps.pendingTokenIds.has('tok-2')).toBe(false);
  });

  it('restores remote authoritative position if a remote move arrives during local save followed by local failure', async () => {
    setupMovementTest();

    const moveDeferred = deferred();
    vi.spyOn(tokensLib, 'moveToken').mockImplementationOnce(() => moveDeferred.promise);

    await harness.render('/game/room-123');

    const revert = vi.fn();

    // Start local move from (1, 1) to (5, 5)
    const { promise: movePromise } = await startMoveToken(createToken(), 5, 5, revert);

    // While local save is in flight, remote move arrives placing tok-1 at (20, 30)
    await act(async () => {
      harness.triggerSocket('tokenMoved', createToken({ x: 20, y: 30 }));
    });

    // Now local save fails
    await act(async () => {
      moveDeferred.reject(new Error('Database conflict'));
      await movePromise;
    });

    // Revert must have received the authoritative position (20, 30), NOT the stale (1, 1)
    expect(revert).toHaveBeenCalledWith(expect.objectContaining({ id: 'tok-1', x: 20, y: 30 }));

    // React board state preserves the remote position
    const tokenEl = harness.container.querySelector('[data-testid="token-tok-1"]');
    expect(tokenEl.getAttribute('data-x')).toBe('20');
    expect(tokenEl.getAttribute('data-y')).toBe('30');

    // Friendly error is shown
    expect(harness.container.querySelector('[role="alert"]').textContent).toContain(
      'Database conflict',
    );
  });

  it('cleans up pending state after success and failure allowing subsequent drags', async () => {
    setupMovementTest();

    // Case 1: Failure cleans up pending state
    const moveSpy = vi
      .spyOn(tokensLib, 'moveToken')
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(createToken({ x: 6, y: 6 }));

    await harness.render('/game/room-123');

    await moveTokenTo(createToken(), 2, 2);
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

    // Subsequent drag after failure is allowed
    await moveTokenTo(createToken(), 6, 6);
    expect(moveSpy).toHaveBeenCalledTimes(2);
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
    const tokenEl = harness.container.querySelector('[data-testid="token-tok-1"]');
    expect(tokenEl.getAttribute('data-x')).toBe('6');
    expect(tokenEl.getAttribute('data-y')).toBe('6');
  });

  it('does not allow an old room completion to modify current room or release newer pending operations', async () => {
    setupTwoRoomMovement({ room2Coords: { x: 100, y: 100 } });

    const oldRoomDeferred = deferred();
    const newRoomDeferred = deferred();
    vi.spyOn(tokensLib, 'moveToken')
      .mockImplementationOnce(() => oldRoomDeferred.promise)
      .mockImplementationOnce(() => newRoomDeferred.promise);

    await harness.render('/game/room-1');
    expect(
      harness.container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x'),
    ).toBe('1');

    // Start move in Room 1
    const oldRevert = vi.fn();
    const { promise: oldMovePromise } = await startMoveToken(createToken(), 5, 5, oldRevert);
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

    // Navigate to Room 2 while Room 1 move is in flight
    await harness.navigate('/game/room-2');

    expect(
      harness.container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x'),
    ).toBe('100');
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

    // Start move in Room 2 on tok-1
    const { promise: newMovePromise } = await startMoveToken(
      createToken({ x: 100, y: 100 }),
      200,
      200,
    );
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

    // Now Room 1's old move finishes
    await act(async () => {
      oldRoomDeferred.resolve(createToken({ x: 5, y: 5 }));
      await oldRoomDeferred.promise;
      await oldMovePromise;
    });

    // Room 2 must NOT be altered by Room 1's completion, and Room 2's pending state must NOT be released
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);
    expect(
      harness.container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x'),
    ).toBe('100');

    // Finally Room 2's move completes
    await act(async () => {
      newRoomDeferred.resolve(createToken({ x: 200, y: 200 }));
      await newRoomDeferred.promise;
      await newMovePromise;
    });

    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
    expect(
      harness.container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x'),
    ).toBe('200');
  });

  it('clears pending flag and remains draggable when move finishes after leaving and returning to the room', async () => {
    setupTwoRoomMovement();

    const moveDeferredSuccess = deferred();
    const moveDeferredFail = deferred();
    vi.spyOn(tokensLib, 'moveToken')
      .mockImplementationOnce(() => moveDeferredSuccess.promise)
      .mockImplementationOnce(() => moveDeferredFail.promise);

    await harness.render('/game/room-1');
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

    // 1. Start move in room-1
    const { promise: movePromise1 } = await startMoveToken(createToken(), 5, 5);
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

    // 2. Navigate to room-2 while move in room-1 is in-flight
    await harness.navigate('/game/room-2');
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

    // 3. Move finishes successfully while in room-2
    await act(async () => {
      moveDeferredSuccess.resolve(createToken({ x: 5, y: 5 }));
      await moveDeferredSuccess.promise;
      await movePromise1;
    });

    // 4. Return to room-1: token must NOT have any stale pending flag and remains draggable
    await harness.navigate('/game/room-1');
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
    expect(latestBoardProps.pendingTokenIds.size).toBe(0);

    // 5. Verify the same behavior when an in-flight move rejects after leaving
    const { promise: movePromise2 } = await startMoveToken(createToken(), 6, 6);
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

    await harness.navigate('/game/room-2');

    await act(async () => {
      moveDeferredFail.reject(new Error('Old room rejection'));
      await movePromise2;
    });

    await harness.navigate('/game/room-1');
    expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
    expect(latestBoardProps.pendingTokenIds.size).toBe(0);
    expect(harness.container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    {
      outcome: 'rejects',
      settleOldMove: (deferred) => deferred.reject(new Error('Stale visit error')),
    },
    {
      outcome: 'resolves',
      settleOldMove: (deferred) => deferred.resolve({ id: 'tok-1', name: 'Aria', x: 5, y: 5 }),
    },
  ])(
    'does not allow an old move that $outcome to alter state or clear pending flags after returning to the room',
    async ({ settleOldMove }) => {
      setupTwoRoomMovement();

      const oldMoveDeferred = deferred();
      const newMoveDeferred = deferred();
      vi.spyOn(tokensLib, 'moveToken')
        .mockImplementationOnce(() => oldMoveDeferred.promise)
        .mockImplementationOnce(() => newMoveDeferred.promise);

      await harness.render('/game/room-1');

      // 1. Start move in visit 1 of room-1
      const oldRevert = vi.fn();
      const { promise: oldMovePromise } = await startMoveToken(createToken(), 5, 5, oldRevert);
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // 2. Leave and return to room-1
      await harness.navigate('/game/room-2');
      await harness.navigate('/game/room-1');
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // 3. Start newer move in visit 2 of room-1
      const { promise: newMovePromise } = await startMoveToken(createToken(), 12, 12);
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // 4. Old move from visit 1 settles
      await act(async () => {
        settleOldMove(oldMoveDeferred);
        await oldMovePromise.catch(() => {});
      });

      // Old move settlement must NOT trigger rollback, display error, overwrite position in visit 2,
      // or clear the newer move's pending flag
      expect(oldRevert).not.toHaveBeenCalled();
      expect(harness.container.querySelector('[role="alert"]')).toBeNull();
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);
      expect(
        harness.container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x'),
      ).toBe('1');

      // 5. Finish newer move
      await act(async () => {
        newMoveDeferred.resolve(createToken({ x: 12, y: 12 }));
        await newMoveDeferred.promise;
        await newMovePromise;
      });

      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
      const tokenEl = harness.container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('12');
      expect(tokenEl.getAttribute('data-y')).toBe('12');
    },
  );
});
