import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import GamePage from './GamePage.jsx';
import * as tokensLib from '../lib/tokens.js';
import * as mapsLib from '../lib/maps.js';
import * as roomsLib from '../lib/rooms.js';
import * as charactersLib from '../lib/characters.js';
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

let latestBoardProps = {};
vi.mock('../components/board/Board.jsx', () => ({
  default: (props) => {
    latestBoardProps = props;
    const { tokens = [], activeMapUrl } = props;
    return (
      <div data-testid="board" data-map-url={activeMapUrl}>
        {tokens.map((t) => (
          <span key={t.id} data-testid={`token-${t.id}`} data-x={t.x} data-y={t.y}>
            {t.name}
          </span>
        ))}
      </div>
    );
  },
}));

vi.mock('../components/ChatPanel.jsx', () => ({
  default: () => (
    <div data-testid="chat-panel">
      <input aria-label="Chat message input" readOnly />
    </div>
  ),
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
    latestBoardProps = {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);
    vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);
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

  it('renders the dice buttons below the chat input', () => {
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

    const inputAt = markup.indexOf('aria-label="Chat message input"');
    const diceAt = markup.indexOf('aria-label="Roll d4"');
    expect(inputAt).toBeGreaterThanOrEqual(0);
    expect(diceAt).toBeGreaterThan(inputAt);
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

  describe('character state on join and reconnect', () => {
    function settle() {
      return new Promise((resolve) => setTimeout(resolve, 10));
    }

    function makeCharacter(overrides = {}) {
      return {
        id: 'char-1',
        user_id: 'user-1',
        name: 'Aria',
        hp: 10,
        max_hp: 12,
        ac: 14,
        notes: 'Scout',
        ...overrides,
      };
    }

    function readCard() {
      return {
        name: container.querySelector('.character-card-name')?.textContent ?? '',
        stats: [...container.querySelectorAll('.character-card-stat')].map(
          (node) => node.textContent,
        ),
        notes: container.querySelector('.character-card-notes')?.textContent ?? '',
        loading: container.querySelector('.character-card-loading') !== null,
      };
    }

    function mockJoin() {
      const mockSocket = {
        connected: true,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      };
      const onJoinedByRoom = new Map();
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockImplementation((roomId, options = {}) => {
        onJoinedByRoom.set(roomId, options.onJoined);
        return { socket: mockSocket, isReady: true, error: null };
      });
      return { mockSocket, onJoinedByRoom };
    }

    function prepareRoom(options) {
      mockAuthenticatedGame(options);
      vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValue([]);
    }

    function dmCast() {
      const aria = makeCharacter({
        id: 'char-aria',
        user_id: 'dm-1',
        name: 'Aria',
        hp: 20,
        max_hp: 20,
        ac: 16,
        notes: 'DM',
      });
      const bruenor = makeCharacter({
        id: 'char-bruenor',
        user_id: 'user-2',
        name: 'Bruenor',
        hp: 30,
        max_hp: 40,
        ac: 18,
        notes: 'Dwarf',
      });
      const drizzt = makeCharacter({
        id: 'char-drizzt',
        user_id: 'user-3',
        name: 'Drizzt',
        hp: 18,
        max_hp: 18,
        ac: 17,
        notes: 'Ranger',
      });
      return { aria, bruenor, drizzt, list: [aria, bruenor, drizzt] };
    }

    async function chooseCharacter(characterId) {
      const picker = container.querySelector('#character-card-picker');
      expect(picker).not.toBeNull();
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      ).set;
      await act(async () => {
        valueSetter.call(picker, characterId);
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    async function openDmWithBruenorSelected(onFetch) {
      const session = mockJoin();
      prepareRoom({ userId: 'dm-1', role: 'dm', roomName: 'Sword Coast' });
      const cast = dmCast();
      const spy = vi
        .spyOn(charactersLib, 'getRoomCharacters')
        .mockImplementation(() => onFetch(cast));
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);

      await renderGamePage('/game/room-123');
      expect(readCard().name).toBe('Aria');
      await chooseCharacter('char-bruenor');
      expect(readCard().name).toBe('Bruenor');
      expect(readCard().notes).toBe('Dwarf');

      return { ...session, ...cast, spy };
    }

    async function rejoin(onJoinedByRoom, mockSocket, roomId) {
      const onJoined = onJoinedByRoom.get(roomId);
      expect(onJoined).toEqual(expect.any(Function));
      await onJoined({ socket: mockSocket, roomId });
    }

    it('reloads a player character when onJoined fires again without the loading flash', async () => {
      const { mockSocket, onJoinedByRoom } = mockJoin();
      prepareRoom({ userId: 'user-1', role: 'player', roomName: 'Icewind Dale' });

      const initial = makeCharacter({ hp: 10, ac: 14, notes: 'Scout' });
      const joined = makeCharacter({ hp: 8, ac: 14, notes: 'Joined' });
      const rejoined = makeCharacter({ hp: 4, ac: 15, notes: 'Rejoined' });
      const secondReload = deferred();
      let phase = 'mount';

      vi.spyOn(charactersLib, 'getMyCharacter').mockImplementation(() => {
        if (phase === 'second') return secondReload.promise;
        if (phase === 'first') return Promise.resolve(joined);
        return Promise.resolve(initial);
      });
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);

      await renderGamePage('/game/room-123');
      expect(readCard()).toMatchObject({ name: 'Aria', notes: 'Scout', loading: false });
      expect(readCard().stats).toContain('HP 10 / 12');

      // First join callback, then a second call for the reconnect.
      phase = 'first';
      await act(async () => {
        await rejoin(onJoinedByRoom, mockSocket, 'room-123');
      });

      phase = 'second';
      await act(async () => {
        const onJoined = onJoinedByRoom.get('room-123');
        expect(onJoined).toEqual(expect.any(Function));
        onJoined({ socket: mockSocket, roomId: 'room-123' });
      });

      // The card stays up while the second refetch is in flight.
      expect(readCard().loading).toBe(false);
      expect(container.textContent).not.toContain('Loading character...');

      await act(async () => {
        secondReload.resolve(rejoined);
        await settle();
      });

      const card = readCard();
      expect(card.loading).toBe(false);
      expect(container.textContent).not.toContain('Loading character...');
      expect(card.name).toBe('Aria');
      expect(card.notes).toBe('Rejoined');
      expect(card.stats).toContain('HP 4 / 12');
      expect(card.stats).toContain('AC 15');
    });

    it('keeps the DM selected character when the refreshed list still includes it', async () => {
      const reload = deferred();
      let phase = 'mount';
      const session = await openDmWithBruenorSelected((cast) => {
        if (phase === 'reload') return reload.promise;
        return Promise.resolve(cast.list);
      });

      phase = 'reload';
      await act(async () => {
        const onJoined = session.onJoinedByRoom.get('room-123');
        expect(onJoined).toEqual(expect.any(Function));
        onJoined({ socket: session.mockSocket, roomId: 'room-123' });
      });

      expect(readCard().loading).toBe(false);
      expect(readCard().name).toBe('Bruenor');
      expect(container.textContent).not.toContain('Loading character...');

      await act(async () => {
        reload.resolve([
          { ...session.aria, hp: 19 },
          { ...session.bruenor, hp: 12, notes: 'Wounded' },
          session.drizzt,
        ]);
        await settle();
      });

      const card = readCard();
      expect(card.loading).toBe(false);
      expect(card.name).toBe('Bruenor');
      expect(card.notes).toBe('Wounded');
      expect(card.stats).toContain('HP 12 / 40');
      expect(container.querySelector('#character-card-picker')?.value).toBe('char-bruenor');
    });

    it('falls back to the DM own character when the selected character is gone', async () => {
      let phase = 'mount';
      const session = await openDmWithBruenorSelected((cast) => {
        if (phase === 'reload') {
          // Drizzt is first. Aria is the DM's own card. Bruenor was removed.
          return Promise.resolve([
            { ...cast.drizzt, hp: 9 },
            { ...cast.aria, hp: 15, notes: 'Still here' },
          ]);
        }
        return Promise.resolve(cast.list);
      });

      phase = 'reload';
      await act(async () => {
        await rejoin(session.onJoinedByRoom, session.mockSocket, 'room-123');
      });

      const card = readCard();
      expect(card.loading).toBe(false);
      expect(card.name).toBe('Aria');
      expect(card.notes).toBe('Still here');
      expect(card.stats).toContain('HP 15 / 20');
      expect(container.textContent).not.toContain('Loading character...');
    });

    it('falls back to the first character when the selection and the DM own card are gone', async () => {
      let phase = 'mount';
      const session = await openDmWithBruenorSelected((cast) => {
        if (phase === 'reload') {
          return Promise.resolve([
            { ...cast.drizzt, hp: 9, notes: 'First' },
            makeCharacter({
              id: 'char-catti',
              user_id: 'user-4',
              name: 'Catti',
              hp: 11,
              max_hp: 11,
              ac: 12,
              notes: 'New',
            }),
          ]);
        }
        return Promise.resolve(cast.list);
      });

      phase = 'reload';
      await act(async () => {
        await rejoin(session.onJoinedByRoom, session.mockSocket, 'room-123');
      });

      const card = readCard();
      expect(card.loading).toBe(false);
      expect(card.name).toBe('Drizzt');
      expect(card.notes).toBe('First');
      expect(card.stats).toContain('HP 9 / 18');
    });

    it('ignores an older character reload superseded by a newer join', async () => {
      const { mockSocket, onJoinedByRoom } = mockJoin();
      prepareRoom({ userId: 'user-1', role: 'player', roomName: 'Neverwinter' });

      const initial = makeCharacter({ hp: 10, notes: 'Scout' });
      const fresh = makeCharacter({ hp: 2, ac: 11, notes: 'Fresh' });
      const stale = makeCharacter({ hp: 99, ac: 1, notes: 'Stale' });
      const staleReload = deferred();
      const freshReload = deferred();
      let phase = 'mount';

      vi.spyOn(charactersLib, 'getMyCharacter').mockImplementation(() => {
        if (phase === 'stale') return staleReload.promise;
        if (phase === 'fresh') return freshReload.promise;
        return Promise.resolve(initial);
      });
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);

      await renderGamePage('/game/room-123');
      expect(readCard().notes).toBe('Scout');

      phase = 'stale';
      await act(async () => {
        onJoinedByRoom.get('room-123')?.({ socket: mockSocket, roomId: 'room-123' });
      });

      phase = 'fresh';
      await act(async () => {
        onJoinedByRoom.get('room-123')?.({ socket: mockSocket, roomId: 'room-123' });
      });

      expect(readCard().loading).toBe(false);

      await act(async () => {
        freshReload.resolve(fresh);
        await settle();
      });

      expect(readCard().notes).toBe('Fresh');
      expect(readCard().stats).toContain('HP 2 / 12');

      await act(async () => {
        staleReload.resolve(stale);
        await settle();
      });

      expect(readCard().notes).toBe('Fresh');
      expect(readCard().stats).toContain('HP 2 / 12');
      expect(container.textContent).not.toContain('Stale');
    });

    it('ignores a character reload that resolves after leaving the room', async () => {
      let navigateFn;
      function NavHelper() {
        navigateFn = useNavigate();
        return null;
      }

      const { mockSocket, onJoinedByRoom } = mockJoin();
      prepareRoom({
        userId: 'user-1',
        role: 'player',
        roomName: (roomId) => (roomId === 'room-a' ? 'Room Alpha' : 'Room Beta'),
      });

      const alpha = makeCharacter({ id: 'char-a', name: 'Alpha', hp: 10, notes: 'Alpha scout' });
      const staleAlpha = makeCharacter({ id: 'char-a', name: 'Alpha', hp: 1, notes: 'Old room' });
      const beta = makeCharacter({
        id: 'char-b',
        name: 'Beta',
        hp: 8,
        max_hp: 9,
        ac: 13,
        notes: 'Posted',
      });
      const betaUpdated = { ...beta, hp: 3, notes: 'Rested' };
      const roomAReload = deferred();
      let roomAPhase = 'mount';
      let roomBPhase = 'mount';

      vi.spyOn(charactersLib, 'getMyCharacter').mockImplementation((_client, roomId) => {
        if (roomId === 'room-b') {
          return Promise.resolve(roomBPhase === 'reload' ? betaUpdated : beta);
        }
        if (roomAPhase === 'reload') return roomAReload.promise;
        return Promise.resolve(alpha);
      });
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);

      await renderGamePage('/game/room-a', <NavHelper />);
      expect(readCard().name).toBe('Alpha');

      roomAPhase = 'reload';
      await act(async () => {
        onJoinedByRoom.get('room-a')?.({ socket: mockSocket, roomId: 'room-a' });
      });

      expect(readCard().loading).toBe(false);
      expect(readCard().name).toBe('Alpha');

      await act(async () => {
        navigateFn('/game/room-b');
        await settle();
      });

      expect(readCard().name).toBe('Beta');
      expect(readCard().notes).toBe('Posted');

      await act(async () => {
        roomAReload.resolve(staleAlpha);
        await settle();
      });

      expect(readCard().name).toBe('Beta');
      expect(container.textContent).not.toContain('Old room');

      roomBPhase = 'reload';
      await act(async () => {
        await rejoin(onJoinedByRoom, mockSocket, 'room-b');
      });

      const card = readCard();
      expect(card.loading).toBe(false);
      expect(card.name).toBe('Beta');
      expect(card.notes).toBe('Rested');
      expect(card.stats).toContain('HP 3 / 9');
      expect(container.textContent).not.toContain('Old room');
    });

    it('keeps the visible character when a player character reload fails', async () => {
      const { mockSocket, onJoinedByRoom } = mockJoin();
      prepareRoom({ userId: 'user-1', role: 'player', roomName: 'Icewind Dale' });

      const initial = makeCharacter({ hp: 10, notes: 'Scout' });
      let failReload = false;
      const spy = vi.spyOn(charactersLib, 'getMyCharacter').mockImplementation(() => {
        if (failReload) return Promise.reject(new Error('Network drop during character reload'));
        return Promise.resolve(initial);
      });
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);

      await renderGamePage('/game/room-123');
      expect(readCard()).toMatchObject({ name: 'Aria', notes: 'Scout', loading: false });
      const fetchesAfterMount = spy.mock.calls.length;

      failReload = true;
      await act(async () => {
        try {
          await rejoin(onJoinedByRoom, mockSocket, 'room-123');
        } catch {
          // A failed refetch must not reject the page into an empty card.
        }
      });

      expect(spy).toHaveBeenCalledTimes(fetchesAfterMount + 1);
      const card = readCard();
      expect(card.loading).toBe(false);
      expect(card.name).toBe('Aria');
      expect(card.notes).toBe('Scout');
      expect(card.stats).toContain('HP 10 / 12');
      expect(container.textContent).not.toContain('Loading character...');
      expect(container.textContent).not.toContain('Create character');
      expect(container.textContent).not.toContain('Unable to load characters.');
    });

    it('keeps the DM selected character when the character list reload fails', async () => {
      let failReload = false;
      const session = await openDmWithBruenorSelected((cast) => {
        if (failReload) return Promise.reject(new Error('Network drop during character reload'));
        return Promise.resolve(cast.list);
      });
      const fetchesAfterMount = session.spy.mock.calls.length;

      failReload = true;
      await act(async () => {
        try {
          await rejoin(session.onJoinedByRoom, session.mockSocket, 'room-123');
        } catch {
          // A failed list refetch must leave the selected card on screen.
        }
      });

      expect(session.spy).toHaveBeenCalledTimes(fetchesAfterMount + 1);
      const card = readCard();
      expect(card.loading).toBe(false);
      expect(card.name).toBe('Bruenor');
      expect(card.notes).toBe('Dwarf');
      expect(card.stats).toContain('HP 30 / 40');
      expect(container.querySelector('#character-card-picker')?.value).toBe('char-bruenor');
      expect(container.textContent).not.toContain('Loading character...');
      expect(container.textContent).not.toContain('Unable to load characters.');
    });
  });

  describe('Token movement and drag integration', () => {
    function setupMovementTest({
      userId = 'dm-1',
      role = 'dm',
      roomName = 'Sword Coast',
      initialTokens = [{ id: 'tok-1', name: 'Aria', x: 1, y: 1 }],
      roomSocketImplementation = null,
      activeMap = null,
    } = {}) {
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

      if (roomSocketImplementation) {
        vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockImplementation(
          roomSocketImplementation(mockSocket, socketListeners),
        );
      } else {
        vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
          socket: mockSocket,
          isReady: true,
          error: null,
        });
      }

      mockAuthenticatedGame({ userId, role, roomName, activeMap });

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

      let navigate;
      function NavWatcher() {
        navigate = useNavigate();
        return null;
      }

      const render = async (path = '/game/room-123') => {
        await renderGamePage(path, <NavWatcher />);
        return {
          navigate: (to) => navigate(to),
        };
      };

      return { mockSocket, socketListeners, render };
    }

    it('passes currentUserId, isDm, isSocketReady, and onMoveToken handler to Board', async () => {
      setupMovementTest({
        userId: 'player-42',
        role: 'player',
      });

      await renderGamePage('/game/room-123');

      expect(latestBoardProps.currentUserId).toBe('player-42');
      expect(latestBoardProps.isDm).toBe(false);
      expect(latestBoardProps.isSocketReady).toBe(true);
      expect(typeof latestBoardProps.onMoveToken).toBe('function');
    });

    it('persists movement via moveToken and emits socket moveToken notification on success', async () => {
      const { mockSocket } = setupMovementTest({
        userId: 'dm-1',
        role: 'dm',
      });

      const moveTokenSpy = vi.spyOn(tokensLib, 'moveToken').mockResolvedValue({
        id: 'tok-1',
        name: 'Aria',
        x: 5,
        y: 6,
      });
      const emitMoveTokenSpy = vi.spyOn(tokensLib, 'emitMoveToken').mockResolvedValue();

      await renderGamePage('/game/room-123');

      const revert = vi.fn();
      await act(async () => {
        await latestBoardProps.onMoveToken({ id: 'tok-1', name: 'Aria', x: 1, y: 1 }, 5, 6, revert);
      });

      expect(moveTokenSpy).toHaveBeenCalledWith(expect.anything(), {
        tokenId: 'tok-1',
        x: 5,
        y: 6,
      });
      expect(emitMoveTokenSpy).toHaveBeenCalledWith(mockSocket, {
        roomId: 'room-123',
        tokenId: 'tok-1',
      });
      expect(revert).not.toHaveBeenCalled();

      const tokenEl = container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('5');
      expect(tokenEl.getAttribute('data-y')).toBe('6');
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('reverts position and displays error if move persistence fails', async () => {
      setupMovementTest({
        userId: 'player-1',
        role: 'player',
      });

      vi.spyOn(tokensLib, 'moveToken').mockRejectedValue(
        new Error('Permission denied to move token.'),
      );
      const emitMoveTokenSpy = vi.spyOn(tokensLib, 'emitMoveToken').mockResolvedValue();

      await renderGamePage('/game/room-123');

      const revert = vi.fn();
      await act(async () => {
        await latestBoardProps.onMoveToken({ id: 'tok-1', name: 'Aria', x: 1, y: 1 }, 5, 6, revert);
      });

      expect(revert).toHaveBeenCalledTimes(1);
      expect(emitMoveTokenSpy).not.toHaveBeenCalled();

      const alertEl = container.querySelector('[role="alert"]');
      expect(alertEl).not.toBeNull();
      expect(alertEl.textContent).toContain('Permission denied to move token.');

      // Token in state remains at previous position
      const tokenEl = container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('1');
      expect(tokenEl.getAttribute('data-y')).toBe('1');
    });

    it('preserves saved position and shows sync warning when socket notification fails', async () => {
      setupMovementTest({
        userId: 'dm-1',
        role: 'dm',
      });

      vi.spyOn(tokensLib, 'moveToken').mockResolvedValue({
        id: 'tok-1',
        name: 'Aria',
        x: 8,
        y: 9,
      });
      vi.spyOn(tokensLib, 'emitMoveToken').mockRejectedValue(
        new Error('Socket notification timeout'),
      );

      await renderGamePage('/game/room-123');

      const revert = vi.fn();
      await act(async () => {
        await latestBoardProps.onMoveToken({ id: 'tok-1', name: 'Aria', x: 1, y: 1 }, 8, 9, revert);
      });

      // Must NOT revert because persistence succeeded
      expect(revert).not.toHaveBeenCalled();

      // State is updated with persisted coordinates
      const tokenEl = container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('8');
      expect(tokenEl.getAttribute('data-y')).toBe('9');

      // User alert displays synchronization failure
      const alertEl = container.querySelector('[role="alert"]');
      expect(alertEl).not.toBeNull();
      expect(alertEl.textContent).toBe(
        'Token position saved, but failed to sync move with other players.',
      );
    });

    it('updates token position on remote tokenMoved socket event and cleans up listener on unmount', async () => {
      const { mockSocket, socketListeners } = setupMovementTest({
        userId: 'player-1',
        role: 'player',
      });

      await renderGamePage('/game/room-123');
      expect(typeof socketListeners['tokenMoved']).toBe('function');

      // Remote member moves token
      await act(async () => {
        socketListeners['tokenMoved']({
          id: 'tok-1',
          name: 'Aria',
          x: 10,
          y: 12,
        });
      });

      const tokenEl = container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('10');
      expect(tokenEl.getAttribute('data-y')).toBe('12');

      // Unmount cleans up socket listener
      await act(async () => {
        root.unmount();
        root = null;
      });

      expect(mockSocket.off).toHaveBeenCalledWith('tokenMoved', expect.any(Function));
      expect(socketListeners['tokenMoved']).toBeUndefined();
    });

    it('buffers tokenMoved events during in-flight snapshot reload so older snapshot does not revert movement', async () => {
      let onJoinedCallback = null;
      const { mockSocket, socketListeners } = setupMovementTest({
        roomName: 'The Underdark',
        activeMap: { id: 'map-1', url: 'https://map.png' },
        initialTokens: null,
        roomSocketImplementation:
          (sock) =>
          (_roomId, { onJoined } = {}) => {
            onJoinedCallback = onJoined;
            return { socket: sock, isReady: true, error: null };
          },
      });

      const initialTokens = deferred();
      const reconnectTokens = deferred();
      vi.spyOn(tokensLib, 'getRoomTokens')
        .mockImplementationOnce(() => initialTokens.promise)
        .mockImplementationOnce(() => reconnectTokens.promise);

      await renderGamePage('/game/room-123');

      await act(async () => {
        initialTokens.resolve([{ id: 't1', name: 'Aria', color: '#4363D8', x: 0, y: 0 }]);
        await initialTokens.promise;
      });

      expect(container.querySelector('[data-testid="token-t1"]').getAttribute('data-x')).toBe('0');

      // Trigger reconnect recovery (snapshot in flight)
      let reconnectPromise;
      await act(async () => {
        reconnectPromise = onJoinedCallback?.({ socket: mockSocket, roomId: 'room-123' });
      });

      // While snapshot in-flight, remote tokenMoved arrives with new position
      await act(async () => {
        socketListeners['tokenMoved']?.({
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
      const tokenEl = container.querySelector('[data-testid="token-t1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('42');
      expect(tokenEl.getAttribute('data-y')).toBe('84');
    });

    it('prevents a second concurrent local drag/save on the same token while the first is pending', async () => {
      setupMovementTest({
        userId: 'dm-1',
        role: 'dm',
        initialTokens: [
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          { id: 'tok-2', name: 'Gimli', x: 3, y: 3 },
        ],
      });

      const moveDeferred1 = deferred();
      const moveDeferred2 = deferred();
      const moveTokenSpy = vi
        .spyOn(tokensLib, 'moveToken')
        .mockImplementationOnce(() => moveDeferred1.promise)
        .mockImplementationOnce(() => moveDeferred2.promise);

      vi.spyOn(tokensLib, 'emitMoveToken').mockResolvedValue();

      await renderGamePage('/game/room-123');

      const revert1 = vi.fn();
      const revert2 = vi.fn();
      let move1Promise;

      // Start first move on tok-1
      await act(async () => {
        move1Promise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          5,
          5,
          revert1,
        );
      });

      // tok-1 is marked pending in Board props
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);
      expect(latestBoardProps.pendingTokenIds.has('tok-2')).toBe(false);

      // Attempt second move on the same token while first is pending
      await act(async () => {
        await latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          9,
          9,
          revert2,
        );
      });

      // Second move must be blocked: moveToken called only once for (5, 5), not for (9, 9)
      expect(moveTokenSpy).toHaveBeenCalledTimes(1);
      expect(moveTokenSpy).toHaveBeenCalledWith(expect.anything(), {
        tokenId: 'tok-1',
        x: 5,
        y: 5,
      });

      // Other token tok-2 can move concurrently without being blocked
      let move2Promise;
      await act(async () => {
        move2Promise = latestBoardProps.onMoveToken(
          { id: 'tok-2', name: 'Gimli', x: 3, y: 3 },
          4,
          4,
          vi.fn(),
        );
      });
      expect(moveTokenSpy).toHaveBeenCalledTimes(2);
      expect(latestBoardProps.pendingTokenIds.has('tok-2')).toBe(true);

      // Complete first move
      await act(async () => {
        moveDeferred1.resolve({ id: 'tok-1', name: 'Aria', x: 5, y: 5 });
        await move1Promise;
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // Complete second token move
      await act(async () => {
        moveDeferred2.resolve({ id: 'tok-2', name: 'Gimli', x: 4, y: 4 });
        await move2Promise;
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-2')).toBe(false);
    });

    it('restores remote authoritative position if a remote move arrives during local save followed by local failure', async () => {
      const { socketListeners } = setupMovementTest({
        userId: 'dm-1',
        role: 'dm',
        initialTokens: [{ id: 'tok-1', name: 'Aria', x: 1, y: 1 }],
      });

      const moveDeferred = deferred();
      vi.spyOn(tokensLib, 'moveToken').mockImplementationOnce(() => moveDeferred.promise);

      await renderGamePage('/game/room-123');

      const revert = vi.fn();
      let movePromise;

      // Start local move from (1, 1) to (5, 5)
      await act(async () => {
        movePromise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          5,
          5,
          revert,
        );
      });

      // While local save is in flight, remote move arrives placing tok-1 at (20, 30)
      await act(async () => {
        socketListeners['tokenMoved']({
          id: 'tok-1',
          name: 'Aria',
          x: 20,
          y: 30,
        });
      });

      // Now local save fails
      await act(async () => {
        moveDeferred.reject(new Error('Database conflict'));
        await movePromise;
      });

      // Revert must have received the authoritative position (20, 30), NOT the stale (1, 1)
      expect(revert).toHaveBeenCalledWith(expect.objectContaining({ id: 'tok-1', x: 20, y: 30 }));

      // React board state preserves the remote position
      const tokenEl = container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('20');
      expect(tokenEl.getAttribute('data-y')).toBe('30');

      // Friendly error is shown
      expect(container.querySelector('[role="alert"]').textContent).toContain('Database conflict');
    });

    it('cleans up pending state after success and failure allowing subsequent drags', async () => {
      setupMovementTest({
        userId: 'dm-1',
        role: 'dm',
        initialTokens: [{ id: 'tok-1', name: 'Aria', x: 1, y: 1 }],
      });

      vi.spyOn(tokensLib, 'emitMoveToken').mockResolvedValue();

      // Case 1: Failure cleans up pending state
      const moveSpy = vi
        .spyOn(tokensLib, 'moveToken')
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce({ id: 'tok-1', name: 'Aria', x: 6, y: 6 });

      await renderGamePage('/game/room-123');

      await act(async () => {
        await latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          2,
          2,
          vi.fn(),
        );
      });

      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // Subsequent drag after failure is allowed
      await act(async () => {
        await latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          6,
          6,
          vi.fn(),
        );
      });

      expect(moveSpy).toHaveBeenCalledTimes(2);
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
      const tokenEl = container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('6');
      expect(tokenEl.getAttribute('data-y')).toBe('6');
    });

    it('does not allow an old room completion to modify current room or release newer pending operations', async () => {
      const { render } = setupMovementTest({
        roomName: (id) => (id === 'room-1' ? 'Room 1' : 'Room 2'),
        initialTokens: (rid) => [
          {
            id: 'tok-1',
            name: 'Aria',
            x: rid === 'room-1' ? 1 : 100,
            y: rid === 'room-1' ? 1 : 100,
          },
        ],
      });

      const oldRoomDeferred = deferred();
      const newRoomDeferred = deferred();
      vi.spyOn(tokensLib, 'moveToken')
        .mockImplementationOnce(() => oldRoomDeferred.promise)
        .mockImplementationOnce(() => newRoomDeferred.promise);

      const { navigate } = await render('/game/room-1');
      expect(container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x')).toBe(
        '1',
      );

      // Start move in Room 1
      const oldRevert = vi.fn();
      let oldMovePromise;
      await act(async () => {
        oldMovePromise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          5,
          5,
          oldRevert,
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // Navigate to Room 2 while Room 1 move is in flight
      await act(async () => {
        navigate('/game/room-2');
      });

      expect(container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x')).toBe(
        '100',
      );
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // Start move in Room 2 on tok-1
      let newMovePromise;
      await act(async () => {
        newMovePromise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 100, y: 100 },
          200,
          200,
          vi.fn(),
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // Now Room 1's old move finishes
      await act(async () => {
        oldRoomDeferred.resolve({ id: 'tok-1', name: 'Aria', x: 5, y: 5 });
        await oldRoomDeferred.promise;
        await oldMovePromise;
      });

      // Room 2 must NOT be altered by Room 1's completion, and Room 2's pending state must NOT be released
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);
      expect(container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x')).toBe(
        '100',
      );

      // Finally Room 2's move completes
      await act(async () => {
        newRoomDeferred.resolve({ id: 'tok-1', name: 'Aria', x: 200, y: 200 });
        await newRoomDeferred.promise;
        await newMovePromise;
      });

      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
      expect(container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x')).toBe(
        '200',
      );
    });

    it('clears pending flag and remains draggable when move finishes after leaving and returning to the room', async () => {
      const { render } = setupMovementTest({
        roomName: (id) => (id === 'room-1' ? 'Room 1' : 'Room 2'),
        initialTokens: (rid) => [
          {
            id: 'tok-1',
            name: 'Aria',
            x: rid === 'room-1' ? 1 : 10,
            y: rid === 'room-1' ? 1 : 10,
          },
        ],
      });

      const moveDeferredSuccess = deferred();
      const moveDeferredFail = deferred();
      vi.spyOn(tokensLib, 'moveToken')
        .mockImplementationOnce(() => moveDeferredSuccess.promise)
        .mockImplementationOnce(() => moveDeferredFail.promise);

      const { navigate } = await render('/game/room-1');
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // 1. Start move in room-1
      let movePromise1;
      await act(async () => {
        movePromise1 = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          5,
          5,
          vi.fn(),
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // 2. Navigate to room-2 while move in room-1 is in-flight
      await act(async () => {
        navigate('/game/room-2');
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // 3. Move finishes successfully while in room-2
      await act(async () => {
        moveDeferredSuccess.resolve({ id: 'tok-1', name: 'Aria', x: 5, y: 5 });
        await moveDeferredSuccess.promise;
        await movePromise1;
      });

      // 4. Return to room-1: token must NOT have any stale pending flag and remains draggable
      await act(async () => {
        navigate('/game/room-1');
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
      expect(latestBoardProps.pendingTokenIds.size).toBe(0);

      // 5. Verify the same behavior when an in-flight move rejects after leaving
      let movePromise2;
      await act(async () => {
        movePromise2 = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          6,
          6,
          vi.fn(),
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      await act(async () => {
        navigate('/game/room-2');
      });

      await act(async () => {
        moveDeferredFail.reject(new Error('Old room rejection'));
        await movePromise2;
      });

      await act(async () => {
        navigate('/game/room-1');
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
      expect(latestBoardProps.pendingTokenIds.size).toBe(0);
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('does not allow an old rejected or successful operation to alter state or clear pending flags after returning to the room', async () => {
      const { render } = setupMovementTest({
        roomName: (id) => (id === 'room-1' ? 'Room 1' : 'Room 2'),
        initialTokens: (rid) => [
          {
            id: 'tok-1',
            name: 'Aria',
            x: rid === 'room-1' ? 1 : 10,
            y: rid === 'room-1' ? 1 : 10,
          },
        ],
      });

      const oldMoveDeferredReject = deferred();
      const newMoveDeferred = deferred();
      vi.spyOn(tokensLib, 'moveToken')
        .mockImplementationOnce(() => oldMoveDeferredReject.promise)
        .mockImplementationOnce(() => newMoveDeferred.promise);

      const { navigate } = await render('/game/room-1');

      // Case A: Old rejected move from visit 1 cannot alter visit 2
      const oldRevert = vi.fn();
      let oldMovePromise;
      await act(async () => {
        oldMovePromise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          5,
          5,
          oldRevert,
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // Leave and return to room-1
      await act(async () => {
        navigate('/game/room-2');
      });
      await act(async () => {
        navigate('/game/room-1');
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // Start newer move in visit 2 of room-1
      let newMovePromise;
      await act(async () => {
        newMovePromise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          9,
          9,
          vi.fn(),
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // Old move from visit 1 rejects
      await act(async () => {
        oldMoveDeferredReject.reject(new Error('Stale visit error'));
        await oldMovePromise;
      });

      // Old failure must NOT trigger rollback, display error, or clear the newer move's pending flag
      expect(oldRevert).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // Finish newer move
      await act(async () => {
        newMoveDeferred.resolve({ id: 'tok-1', name: 'Aria', x: 9, y: 9 });
        await newMoveDeferred.promise;
        await newMovePromise;
      });

      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
      const tokenEl = container.querySelector('[data-testid="token-tok-1"]');
      expect(tokenEl.getAttribute('data-x')).toBe('9');
      expect(tokenEl.getAttribute('data-y')).toBe('9');
    });

    it('does not allow an old successful operation to overwrite state or clear newer pending flags after returning to the room', async () => {
      const { render } = setupMovementTest({
        roomName: (id) => (id === 'room-1' ? 'Room 1' : 'Room 2'),
        initialTokens: (rid) => [
          {
            id: 'tok-1',
            name: 'Aria',
            x: rid === 'room-1' ? 1 : 10,
            y: rid === 'room-1' ? 1 : 10,
          },
        ],
      });

      const oldMoveDeferredSuccess = deferred();
      const newMoveDeferred = deferred();
      vi.spyOn(tokensLib, 'moveToken')
        .mockImplementationOnce(() => oldMoveDeferredSuccess.promise)
        .mockImplementationOnce(() => newMoveDeferred.promise);

      const { navigate } = await render('/game/room-1');

      // 1. Start move in visit 1 of room-1
      let oldMovePromise;
      await act(async () => {
        oldMovePromise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          5,
          5,
          vi.fn(),
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // 2. Leave and return to room-1
      await act(async () => {
        navigate('/game/room-2');
      });
      await act(async () => {
        navigate('/game/room-1');
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);

      // 3. Start newer move in visit 2 of room-1
      let newMovePromise;
      await act(async () => {
        newMovePromise = latestBoardProps.onMoveToken(
          { id: 'tok-1', name: 'Aria', x: 1, y: 1 },
          12,
          12,
          vi.fn(),
        );
      });
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);

      // 4. Old move from visit 1 resolves with (5, 5)
      await act(async () => {
        oldMoveDeferredSuccess.resolve({ id: 'tok-1', name: 'Aria', x: 5, y: 5 });
        await oldMoveDeferredSuccess.promise;
        await oldMovePromise;
      });

      // Old success must NOT overwrite position in visit 2 or clear newer move's pending flag
      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(true);
      expect(container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x')).toBe(
        '1',
      );

      // 5. Newer move finishes
      await act(async () => {
        newMoveDeferred.resolve({ id: 'tok-1', name: 'Aria', x: 12, y: 12 });
        await newMoveDeferred.promise;
        await newMovePromise;
      });

      expect(latestBoardProps.pendingTokenIds.has('tok-1')).toBe(false);
      expect(container.querySelector('[data-testid="token-tok-1"]').getAttribute('data-x')).toBe(
        '12',
      );
    });
  });

  describe('character settings panel', () => {
    function settle() {
      return new Promise((resolve) => setTimeout(resolve, 10));
    }

    function setInputValue(input, value) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set;
      nativeInputValueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function settingsButton(label = 'Open settings') {
      return container.querySelector(`.game-top-bar button[aria-label="${label}"]`);
    }

    function settingsPanel() {
      return container.querySelector('aside[aria-label="Settings"]');
    }

    async function renderMember({
      userId = 'user-1',
      role = 'player',
      roomName = 'Icewind Dale',
      activeMap = null,
      tokens = [],
    } = {}) {
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() },
        isReady: true,
        error: null,
      });
      mockAuthenticatedGame({ userId, role, roomName, activeMap });
      vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValue(tokens);
      await renderGamePage('/game/room-123');
    }

    async function openSettings() {
      const button = settingsButton('Open settings');
      expect(button, 'top-bar Open settings button').toBeInstanceOf(HTMLButtonElement);
      await act(async () => {
        button.click();
      });
      const panel = settingsPanel();
      expect(panel, 'settings panel').not.toBeNull();
      expect(panel.hidden).toBe(false);
      expect(panel.style.display).not.toBe('none');
      return panel;
    }

    async function expectFocusableSettingsButton() {
      const button = settingsButton('Open settings');
      expect(button, 'top-bar Open settings button').toBeInstanceOf(HTMLButtonElement);
      expect(button.type).toBe('button');
      expect(button.disabled).toBe(false);
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      await act(async () => {
        button.focus();
      });
      expect(document.activeElement).toBe(button);
    }

    it('does not render a permanent Character card sidebar', async () => {
      await renderMember();

      expect(container.querySelector('aside[aria-label="Character card"]')).toBeNull();
      expect(container.querySelector('.character-sidebar')).toBeNull();
      expect(
        [...container.querySelectorAll('aside, [role="complementary"]')].some(
          (region) => region.getAttribute('aria-label') === 'Character card',
        ),
      ).toBe(false);
    });

    it('shows a focusable Settings button to a player', async () => {
      await renderMember({ userId: 'user-1', role: 'player' });
      await expectFocusableSettingsButton();
    });

    it('shows a focusable Settings button to the DM', async () => {
      await renderMember({ userId: 'dm-1', role: 'dm' });
      await expectFocusableSettingsButton();
    });

    it("opens the player's own character card from the Settings button", async () => {
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue({
        id: 'char-aria',
        user_id: 'user-1',
        name: 'Aria Shadowmend',
        hp: 7,
        max_hp: 12,
        ac: 15,
        notes: 'Has a cursed amulet',
      });

      await renderMember({ userId: 'user-1', role: 'player' });
      const panel = await openSettings();

      const tab = [...panel.querySelectorAll('[role="tab"]')].find(
        (node) => node.textContent === 'Character',
      );
      expect(tab, 'Character tab').not.toBeNull();
      expect(panel.querySelector('.character-card-name')?.textContent).toBe('Aria Shadowmend');
      expect(panel.textContent).toContain('HP 7 / 12');
      expect(panel.textContent).toContain('AC 15');
      expect(panel.textContent).toContain('Has a cursed amulet');
      expect(panel.querySelector('#character-card-picker')).toBeNull();
      expect(settingsButton('Close settings')?.getAttribute('aria-expanded')).toBe('true');
    });

    it('lets a player create a character from inside the panel', async () => {
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);
      const createSpy = vi.spyOn(charactersLib, 'createCharacter').mockResolvedValue({
        id: 'char-nyx',
        user_id: 'user-1',
        name: 'Nyx',
        hp: 8,
        max_hp: 8,
        ac: 13,
        notes: '',
      });

      await renderMember({ userId: 'user-1', role: 'player' });
      const panel = await openSettings();

      await act(async () => {
        setInputValue(panel.querySelector('#character-name'), 'Nyx');
        setInputValue(panel.querySelector('#character-max-hp'), '8');
        setInputValue(panel.querySelector('#character-ac'), '13');
      });

      const submit = [...panel.querySelectorAll('button')].find(
        (button) => button.textContent === 'Create character',
      );
      expect(submit, 'create character button').toBeInstanceOf(HTMLButtonElement);

      await act(async () => {
        submit.click();
        await settle();
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          roomId: 'room-123',
          userId: 'user-1',
          name: 'Nyx',
          maxHp: 8,
          ac: 13,
        }),
      );
      expect(panel.querySelector('#character-name')).toBeNull();
      expect(panel.querySelector('.character-card-name')?.textContent).toBe('Nyx');
      expect(panel.textContent).toContain('HP 8 / 8');
      expect(panel.textContent).toContain('AC 13');
    });

    it('shows a validation error inside the settings panel', async () => {
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);
      const createSpy = vi.spyOn(charactersLib, 'createCharacter');

      await renderMember({ userId: 'user-1', role: 'player' });
      const panel = await openSettings();
      const submit = [...panel.querySelectorAll('button')].find(
        (button) => button.textContent === 'Create character',
      );
      expect(submit, 'create character button').toBeInstanceOf(HTMLButtonElement);

      await act(async () => {
        submit.click();
      });

      expect(panel.querySelector('[role="alert"]')?.textContent).toContain(
        'Character name is required.',
      );
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('shows the loading state inside the settings panel', async () => {
      const pending = deferred();
      vi.spyOn(charactersLib, 'getMyCharacter').mockImplementation(() => pending.promise);

      await renderMember({ userId: 'user-1', role: 'player' });
      const panel = await openSettings();

      expect(panel.textContent).toContain('Loading character...');
      expect(container.querySelector('.character-sidebar')).toBeNull();
    });

    it('shows a friendly load error inside the settings panel', async () => {
      vi.spyOn(charactersLib, 'getMyCharacter').mockRejectedValue(
        new Error(
          'duplicate key value violates unique constraint 123e4567-e89b-12d3-a456-426614174000',
        ),
      );

      await renderMember({ userId: 'user-1', role: 'player' });
      const panel = await openSettings();

      expect(panel.textContent).toContain('Unable to load characters.');
      expect(panel.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
      expect(container.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
    });

    it('lets the DM pick a character inside the settings panel', async () => {
      const aria = {
        id: 'char-aria',
        user_id: 'dm-1',
        name: 'Aria',
        hp: 20,
        max_hp: 20,
        ac: 16,
        notes: 'DM',
      };
      const bruenor = {
        id: 'char-bruenor',
        user_id: 'user-2',
        name: 'Bruenor',
        hp: 30,
        max_hp: 40,
        ac: 18,
        notes: 'Dwarf',
      };
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([aria, bruenor]);
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);

      await renderMember({ userId: 'dm-1', role: 'dm', roomName: 'Sword Coast' });
      const panel = await openSettings();
      const picker = panel.querySelector('#character-card-picker');
      expect(picker, 'character picker').toBeInstanceOf(HTMLSelectElement);
      expect(panel.querySelector('.character-card-name')?.textContent).toBe('Aria');
      expect([...picker.options].map((option) => option.textContent)).toEqual(
        expect.arrayContaining(['Aria', 'Bruenor']),
      );

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      ).set;
      await act(async () => {
        valueSetter.call(picker, 'char-bruenor');
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(panel.querySelector('.character-card-name')?.textContent).toBe('Bruenor');
      expect(panel.textContent).toContain('Dwarf');
      expect(panel.querySelector('#character-card-picker')?.value).toBe('char-bruenor');
    });

    it('keeps unfinished create-form text after the panel is closed and reopened', async () => {
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);

      await renderMember({ userId: 'user-1', role: 'player' });
      const panel = await openSettings();
      const nameInput = panel.querySelector('#character-name');
      expect(nameInput, 'create form name field').toBeInstanceOf(HTMLInputElement);

      await act(async () => {
        setInputValue(nameInput, 'Unfinished hero');
      });

      const closeButton = settingsButton('Close settings');
      expect(closeButton, 'top-bar Close settings button').toBeInstanceOf(HTMLButtonElement);
      expect(closeButton.getAttribute('aria-expanded')).toBe('true');

      await act(async () => {
        closeButton.click();
      });

      const hiddenPanel = settingsPanel();
      expect(hiddenPanel, 'settings panel stays mounted').not.toBeNull();
      expect(hiddenPanel.hidden).toBe(true);
      expect(hiddenPanel.style.display).toBe('none');
      expect(hiddenPanel.querySelector('#character-name')?.value).toBe('Unfinished hero');
      expect(settingsButton('Open settings')?.getAttribute('aria-expanded')).toBe('false');

      const reopened = await openSettings();
      expect(reopened.querySelector('#character-name')?.value).toBe('Unfinished hero');
    });

    it('keeps the board, chat, and dice roller mounted outside the settings panel', async () => {
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);

      await renderMember({
        userId: 'user-1',
        role: 'player',
        activeMap: { id: 'map-1', url: 'https://map.example/board.png' },
        tokens: [{ id: 'tok-1', name: 'Aria', x: 2, y: 3 }],
      });
      const panel = await openSettings();

      const board = container.querySelector('.game-viewport [data-testid="board"]');
      const chat = container.querySelector('[data-testid="chat-panel"]');
      const dice = container.querySelector('[aria-label="Roll d20"]');
      expect(board, 'board').not.toBeNull();
      expect(chat, 'chat').not.toBeNull();
      expect(dice, 'dice').not.toBeNull();
      expect(panel.contains(board)).toBe(false);
      expect(panel.contains(chat)).toBe(false);
      expect(panel.contains(dice)).toBe(false);
      expect(container.querySelector('.game-main-area .character-sidebar')).toBeNull();
      expect(latestBoardProps.width).toBe(800);
      expect(latestBoardProps.height).toBe(600);
      expect(latestBoardProps.onMoveToken).toEqual(expect.any(Function));
      expect(latestBoardProps.activeMapUrl).toBe('https://map.example/board.png');

      const chatInput = container.querySelector('[aria-label="Chat message input"]');
      const firstDie = container.querySelector('[aria-label="Roll d4"]');
      expect(chatInput.compareDocumentPosition(firstDie) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });
});
