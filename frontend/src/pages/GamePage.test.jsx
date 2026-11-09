import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import GamePage from './GamePage.jsx';
import * as tokensLib from '../lib/tokens.js';
import * as mapsLib from '../lib/maps.js';
import * as roomsLib from '../lib/rooms.js';
import { supabase } from '../lib/supabaseClient.js';
import * as useRoomSocketModule from '../hooks/useRoomSocket.js';
import { deferred } from '../test/deferred.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-konva', () => ({
  Stage: ({ children }) => <div data-testid="stage">{children}</div>,
  Layer: ({ children }) => <div data-testid="layer">{children}</div>,
  Image: () => <div data-testid="konva-image" />,
  Group: ({ children, 'data-x': x, 'data-y': y }) => (
    <div data-testid="token-group" data-x={x} data-y={y}>
      {children}
    </div>
  ),
  Circle: () => <div data-testid="token-circle" />,
  Text: ({ text }) => <div data-testid="token-text">{text}</div>,
  Line: () => <div data-testid="grid-line" />,
}));

vi.mock('../components/board/Board.jsx', () => ({
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

vi.mock('../components/ChatPanel.jsx', () => ({
  default: () => <div data-testid="chat-panel" />,
}));

let latestDMProps = {};
vi.mock('../components/DMControls.jsx', () => ({
  default: (props) => {
    latestDMProps = props;
    return (
      <div data-testid="dm-controls">
        <button
          data-testid="add-token-btn"
          onClick={() => props.onAddToken?.('Drizzt', '#3CB44B')}
        />
        <button
          data-testid="select-map-btn"
          onClick={() => props.onSelectActiveMap?.({ id: 'map-new', url: 'https://new-map.png' })}
        />
      </div>
    );
  },
}));

describe('GamePage route', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
      root = null;
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockAuthenticatedGame({
    userId = 'user-1',
    role = 'player',
    roomName = 'Icewind Dale',
    members = [],
    activeMap = null,
  } = {}) {
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role } }),
    });

    vi.spyOn(roomsLib, 'getRoomName').mockImplementation(async (_sb, rid) => {
      return typeof roomName === 'function' ? roomName(rid) : roomName;
    });
    vi.spyOn(roomsLib, 'getRoomMembers').mockImplementation((_sb, rid) => {
      return typeof members === 'function' ? members(rid) : Promise.resolve(members);
    });
    vi.spyOn(mapsLib, 'getActiveMap').mockImplementation((_sb, rid) => {
      return typeof activeMap === 'function' ? activeMap(rid) : Promise.resolve(activeMap);
    });
  }

  async function renderGamePage(initialPath = '/game/room-123', extraNode = null) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          {extraNode}
          <Routes>
            <Route path="/game/:roomId" element={<GamePage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it('does not render the internal room uuid from /game/:roomId', () => {
    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
      socket: null,
      isReady: false,
      error: null,
    });

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/game/room-123']}>
        <Routes>
          <Route path="/game/:roomId" element={<GamePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).not.toMatch(/room-123/);
  });

  it('keeps loading active while initial snapshot is delayed, only showing board once resolved', async () => {
    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
      socket: null,
      isReady: false,
      error: null,
    });

    mockAuthenticatedGame({
      activeMap: { id: 'map-1', url: 'https://map.png' },
    });

    const snapshot = deferred();
    vi.spyOn(tokensLib, 'getRoomTokens').mockImplementation(() => snapshot.promise);

    await renderGamePage('/game/room-123');

    // Loading indicator must be visible while snapshot is delayed
    expect(container.textContent).toContain('Loading game room...');
    expect(container.querySelector('[data-testid="board"]')).toBeNull();

    // Resolve snapshot
    await act(async () => {
      snapshot.resolve([{ id: 't1', name: 'Aria', x: 0, y: 0 }]);
      await new Promise((r) => setTimeout(r, 10));
    });

    // Loading indicator cleared and board rendered
    expect(container.textContent).not.toContain('Loading game room...');
    expect(container.querySelector('[data-testid="board"]')).not.toBeNull();
  });

  it('ends loading and shows useful error when initial snapshot fails', async () => {
    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
      socket: null,
      isReady: false,
      error: null,
    });

    mockAuthenticatedGame();
    vi.spyOn(tokensLib, 'getRoomTokens').mockRejectedValue(
      new Error('Failed to load room tokens from Supabase'),
    );

    await renderGamePage('/game/room-123');

    // Loading ends and recovery error alert is shown
    expect(container.textContent).not.toContain('Loading game room...');
    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl.textContent).toContain('Failed to load room tokens from Supabase');
  });

  it('preserves existing board state on reconnect recovery failure and clears error on retry success', async () => {
    const mockSocket = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    let onJoinedCallback = null;
    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockImplementation(
      (_roomId, { onJoined } = {}) => {
        onJoinedCallback = onJoined;
        return { socket: mockSocket, isReady: true, error: null };
      },
    );

    mockAuthenticatedGame({
      roomName: 'Baldurs Gate',
      activeMap: { id: 'm1', url: 'https://m1.png' },
    });

    // Initial load succeeds with token Aria
    vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValueOnce([
      { id: 't1', name: 'Aria', x: 5, y: 5 },
    ]);

    await renderGamePage('/game/room-123');

    expect(container.querySelector('[data-testid="token-t1"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();

    // 1. Reconnect recovery fails:
    vi.spyOn(tokensLib, 'getRoomTokens').mockRejectedValueOnce(
      new Error('Network drop during token recovery'),
    );

    await act(async () => {
      await onJoinedCallback?.({ socket: mockSocket, roomId: 'room-123' });
    });

    // Board state must be PRESERVED (token-t1 still on the board):
    expect(container.querySelector('[data-testid="token-t1"]')).not.toBeNull();
    // Useful error must be displayed:
    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl.textContent).toContain('Network drop during token recovery');

    // 2. Successful retry clears the error:
    vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValueOnce([
      { id: 't1', name: 'Aria', x: 5, y: 5 },
      { id: 't2', name: 'Bruenor', x: 10, y: 10 },
    ]);

    await act(async () => {
      await onJoinedCallback?.({ socket: mockSocket, roomId: 'room-123' });
    });

    // Error alert must be cleared:
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-testid="token-t2"]')).not.toBeNull();
  });

  it('recovers missed updates and prevents in-flight snapshot from overwriting newer socket events', async () => {
    const socketListeners = {};
    const mockSocket = {
      connected: true,
      on: vi.fn((event, handler) => {
        socketListeners[event] = handler;
      }),
      off: vi.fn((event) => {
        delete socketListeners[event];
      }),
      emit: vi.fn(),
    };

    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
      socket: mockSocket,
      isReady: true,
      error: null,
    });

    mockAuthenticatedGame({
      roomName: 'The Underdark',
      activeMap: { id: 'map-1', url: 'https://map.png' },
    });

    const snapshot = deferred();
    vi.spyOn(tokensLib, 'getRoomTokens').mockImplementation(() => snapshot.promise);

    await renderGamePage('/game/room-123');

    // While getRoomTokens snapshot is in-flight, a newer token update arrives via socket:
    await act(async () => {
      socketListeners['tokenUpdated']?.({
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
      await new Promise((r) => setTimeout(r, 10));
    });

    // Verify token on the board preserved x: 42, y: 84 and was not overwritten by x: 0, y: 0
    const tokenEl = container.querySelector('[data-testid="token-t1"]');
    expect(tokenEl).not.toBeNull();
    expect(tokenEl.getAttribute('data-x')).toBe('42');
    expect(tokenEl.getAttribute('data-y')).toBe('84');
  });

  it('preserves local token actions and map selections during snapshot recovery', async () => {
    const mockSocket = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
      socket: mockSocket,
      isReady: true,
      error: null,
    });

    mockAuthenticatedGame({
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

    await renderGamePage('/game/room-123');

    // While snapshots are in-flight, execute local token add and local map selection:
    await act(async () => {
      await latestDMProps.onAddToken?.('Drizzt', '#3CB44B');
      latestDMProps.onSelectActiveMap?.({ id: 'map-new', url: 'https://new-map.png' });
    });

    // Now resolve the older database snapshot:
    await act(async () => {
      tokensDeferred.resolve([{ id: 'old-token-1', name: 'Aria', color: '#4363D8', x: 1, y: 1 }]);
      mapDeferred.resolve({ id: 'map-old', url: 'https://old-map.png' });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Verify local token 'Drizzt' is preserved alongside the snapshot
    const addedTokenEl = container.querySelector('[data-testid="token-local-token-1"]');
    expect(addedTokenEl).not.toBeNull();
    expect(addedTokenEl.textContent).toBe('Drizzt');

    // Verify local map selection 'https://new-map.png' is preserved and not overwritten by 'https://old-map.png'
    const boardEl = container.querySelector('[data-testid="board"]');
    expect(boardEl.getAttribute('data-map-url')).toBe('https://new-map.png');
  });

  it('discards independently delayed snapshots when a newer join supersedes them', async () => {
    const mockSocket = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    let onJoinedCallback = null;
    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockImplementation(
      (_roomId, { onJoined } = {}) => {
        onJoinedCallback = onJoined;
        return { socket: mockSocket, isReady: true, error: null };
      },
    );

    mockAuthenticatedGame({
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
    await renderGamePage('/game/room-123');

    // Complete initial loading
    await act(async () => {
      initialTokens.resolve([{ id: 'tok-init', name: 'Initial Token', x: 0, y: 0 }]);
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.querySelector('[data-testid="token-tok-init"]')).not.toBeNull();

    // 1. Reconnect triggers recovery (sync 1, staleTokens.promise)
    await act(async () => {
      onJoinedCallback?.({ socket: mockSocket, roomId: 'room-123' });
    });

    // 2. A rapid second reconnect triggers a newer recovery (sync 2, freshTokens.promise) before sync 1 resolves
    await act(async () => {
      onJoinedCallback?.({ socket: mockSocket, roomId: 'room-123' });
    });

    // 3. Newer recovery resolves with fresh token:
    await act(async () => {
      freshTokens.resolve([
        { id: 'tok-fresh', name: 'Fresh Token', color: '#E6194B', x: 10, y: 10 },
      ]);
      await new Promise((r) => setTimeout(r, 10));
    });

    // Verify fresh token is displayed
    expect(container.querySelector('[data-testid="token-tok-fresh"]')).not.toBeNull();

    // 4. Stale recovery resolves late with outdated tokens:
    await act(async () => {
      staleTokens.resolve([{ id: 'tok-stale', name: 'Stale Token', color: '#000000', x: 0, y: 0 }]);
      await new Promise((r) => setTimeout(r, 10));
    });

    // Outdated stale token must be discarded and NOT overwrite fresh token
    expect(container.querySelector('[data-testid="token-tok-stale"]')).toBeNull();
    expect(container.querySelector('[data-testid="token-tok-fresh"]')).not.toBeNull();
  });

  it('prevents old room member lookup resolution from starting an additional snapshot after navigating to a new room', async () => {
    let navigateFn;
    function NavHelper() {
      navigateFn = useNavigate();
      return null;
    }

    const mockSocket = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };

    vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
      socket: mockSocket,
      isReady: true,
      error: null,
    });

    const roomAMembers = deferred();

    mockAuthenticatedGame({
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
    await renderGamePage('/game/room-a', <NavHelper />);

    // Room A member lookup is paused, so Room A has NOT started any token snapshot
    expect(getRoomTokensSpy).not.toHaveBeenCalledWith(expect.anything(), 'room-a');

    // 2. Navigate to room B and start B's snapshot
    await act(async () => {
      navigateFn('/game/room-b');
      await new Promise((r) => setTimeout(r, 10));
    });

    // Verify Room B's snapshot was requested
    expect(getRoomTokensSpy).toHaveBeenCalledWith(expect.anything(), 'room-b');

    // 3. Resolve room A's member lookup
    await act(async () => {
      roomAMembers.resolve([{ user_id: 'dm-1', role: 'dm', display_name: 'DM' }]);
      await new Promise((r) => setTimeout(r, 10));
    });

    // 4. Verify room A started no additional snapshot and room B's snapshot still applies successfully
    expect(getRoomTokensSpy).not.toHaveBeenCalledWith(expect.anything(), 'room-a');
    expect(container.querySelector('[data-testid="token-tok-b"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="token-tok-b"]').textContent).toBe('Token Beta');
    expect(container.querySelector('[data-testid="token-tok-a"]')).toBeNull();
  });
});
