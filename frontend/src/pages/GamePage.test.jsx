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
});
