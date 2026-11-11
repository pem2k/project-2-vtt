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
import CharacterTab from '../components/CharacterTab.jsx';
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
vi.mock('../components/SettingsPanel.jsx', () => ({
  default: (props) => {
    latestDMProps = props;
    return (
      <div data-testid="settings-panel">
        <CharacterTab
          character={props.character}
          characters={props.characters}
          isDM={props.isDM}
          onCreate={props.onCreateCharacter}
          onSelect={props.onSelectCharacter}
          onUpdateHp={props.onUpdateCharacterHp}
          characterLoading={props.characterLoading}
          characterError={props.characterError}
          characterReady={props.characterReady}
        />
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

  describe('Character workflow and HP live synchronization (#14)', () => {
    function prepareCharacterTest(options = {}) {
      mockAuthenticatedGame(options);
      vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValue([]);
    }

    function setInputValue(input, value) {
      act(() => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    it('allows DM to create two characters consecutively; form remains available and resets only after success', async () => {
      const socketListeners = {};
      const mockSocket = {
        connected: true,
        on: vi.fn((event, handler) => {
          socketListeners[event] = handler;
        }),
        off: vi.fn(),
        emit: vi.fn(),
      };
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: mockSocket,
        isReady: true,
        error: null,
      });
      prepareCharacterTest({ userId: 'dm-1', role: 'dm' });
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);
      vi.spyOn(charactersLib, 'emitCharacterUpdated').mockResolvedValue({ ok: true });

      let createCallCount = 0;
      vi.spyOn(charactersLib, 'createCharacter').mockImplementation(async (_sb, params) => {
        createCallCount++;
        return {
          id: `char-goblin-${createCallCount}`,
          room_id: params.roomId,
          user_id: params.userId,
          name: params.name,
          hp: params.maxHp,
          max_hp: params.maxHp,
          ac: params.ac,
          notes: '',
        };
      });

      await renderGamePage('/game/room-123');

      // Form is available initially
      expect(container.querySelector('.character-create-section')).not.toBeNull();
      const nameInput = container.querySelector('#character-name');
      const maxHpInput = container.querySelector('#character-max-hp');
      const acInput = container.querySelector('#character-ac');
      const form = container.querySelector('form.character-card-form');

      // Create 1st character: Goblin 1
      await act(async () => {
        setInputValue(nameInput, 'Goblin 1');
        setInputValue(maxHpInput, '10');
        setInputValue(acInput, '12');
      });
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // 1st character created and selected
      expect(charactersLib.createCharacter).toHaveBeenCalledTimes(1);
      expect(charactersLib.emitCharacterUpdated).toHaveBeenCalledWith(mockSocket, {
        roomId: 'room-123',
        characterId: 'char-goblin-1',
      });
      expect(container.querySelector('.character-card-name').textContent).toBe('Goblin 1');

      // Form inputs are cleared
      expect(nameInput.value).toBe('');
      expect(maxHpInput.value).toBe('');
      expect(acInput.value).toBe('');

      // Form is STILL available for DM!
      expect(container.querySelector('.character-create-section')).not.toBeNull();

      // Create 2nd character: Goblin 2
      await act(async () => {
        setInputValue(nameInput, 'Goblin 2');
        setInputValue(maxHpInput, '15');
        setInputValue(acInput, '14');
      });
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // 2nd character created and selected
      expect(charactersLib.createCharacter).toHaveBeenCalledTimes(2);
      expect(charactersLib.emitCharacterUpdated).toHaveBeenCalledWith(mockSocket, {
        roomId: 'room-123',
        characterId: 'char-goblin-2',
      });
      expect(container.querySelector('.character-card-name').textContent).toBe('Goblin 2');

      // Form inputs cleared again
      expect(nameInput.value).toBe('');
      expect(maxHpInput.value).toBe('');
      expect(acInput.value).toBe('');

      // Both characters present in picker
      const picker = container.querySelector('#character-card-picker');
      expect(picker).not.toBeNull();
      expect(picker.textContent).toContain('Goblin 1');
      expect(picker.textContent).toContain('Goblin 2');
    });

    it('failed creation preserves draft and displays friendly error', async () => {
      const mockSocket = { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() };
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: mockSocket,
        isReady: true,
        error: null,
      });
      prepareCharacterTest({ userId: 'dm-1', role: 'dm' });
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);
      vi.spyOn(charactersLib, 'createCharacter').mockRejectedValue(
        new Error('Database network timeout'),
      );

      await renderGamePage('/game/room-123');

      const nameInput = container.querySelector('#character-name');
      const maxHpInput = container.querySelector('#character-max-hp');
      const acInput = container.querySelector('#character-ac');
      const form = container.querySelector('form.character-card-form');

      await act(async () => {
        setInputValue(nameInput, 'Bugbear');
        setInputValue(maxHpInput, '25');
        setInputValue(acInput, '15');
      });

      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // Form retained draft
      expect(nameInput.value).toBe('Bugbear');
      expect(maxHpInput.value).toBe('25');
      expect(acInput.value).toBe('15');

      // Shows exactly one friendly error beside the form (no duplicate tab alert)
      const alerts = container.querySelectorAll('.auth-error');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toBe('Unable to create character.');
    });

    it('DM edits any character current HP via updateCharacterHp and emits socket notification', async () => {
      const mockSocket = { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() };
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: mockSocket,
        isReady: true,
        error: null,
      });
      prepareCharacterTest({ userId: 'dm-1', role: 'dm' });
      const aria = {
        id: 'char-1',
        user_id: 'player-1',
        name: 'Aria',
        hp: 20,
        max_hp: 20,
        ac: 14,
        notes: '',
      };
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([aria]);
      vi.spyOn(charactersLib, 'updateCharacterHp').mockResolvedValue({ ...aria, hp: 12 });
      vi.spyOn(charactersLib, 'emitCharacterUpdated').mockResolvedValue({ ok: true });

      await renderGamePage('/game/room-123');

      const hpInput = container.querySelector('input[name="currentHp"]');
      const hpForm = container.querySelector('form.character-hp-form');

      expect(hpInput.value).toBe('20');

      await act(async () => {
        setInputValue(hpInput, '12');
      });
      await act(async () => {
        hpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(charactersLib.updateCharacterHp).toHaveBeenCalledWith(supabase, {
        characterId: 'char-1',
        hp: 12,
        isDM: true,
      });
      expect(charactersLib.emitCharacterUpdated).toHaveBeenCalledWith(mockSocket, {
        roomId: 'room-123',
        characterId: 'char-1',
      });
      expect(hpInput.value).toBe('12');
    });

    it('Player edits own current HP via updateCharacterHp and emits socket notification', async () => {
      const mockSocket = { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() };
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: mockSocket,
        isReady: true,
        error: null,
      });
      prepareCharacterTest({ userId: 'player-1', role: 'player' });
      const aria = {
        id: 'char-1',
        user_id: 'player-1',
        name: 'Aria',
        hp: 10,
        max_hp: 15,
        ac: 14,
        notes: '',
      };
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(aria);
      vi.spyOn(charactersLib, 'updateCharacterHp').mockResolvedValue({ ...aria, hp: 5 });
      vi.spyOn(charactersLib, 'emitCharacterUpdated').mockResolvedValue({ ok: true });

      await renderGamePage('/game/room-123');

      const hpInput = container.querySelector('input[name="currentHp"]');
      const hpForm = container.querySelector('form.character-hp-form');

      await act(async () => {
        setInputValue(hpInput, '5');
      });
      await act(async () => {
        hpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(charactersLib.updateCharacterHp).toHaveBeenCalledWith(supabase, {
        characterId: 'char-1',
        hp: 5,
        isDM: false,
      });
      expect(charactersLib.emitCharacterUpdated).toHaveBeenCalledWith(mockSocket, {
        roomId: 'room-123',
        characterId: 'char-1',
      });
      expect(hpInput.value).toBe('5');
    });

    it('incoming HP update on another character preserves DM current selection', async () => {
      const socketListeners = {};
      const mockSocket = {
        connected: true,
        on: vi.fn((event, handler) => {
          socketListeners[event] = handler;
        }),
        off: vi.fn(),
        emit: vi.fn(),
      };
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: mockSocket,
        isReady: true,
        error: null,
      });
      prepareCharacterTest({ userId: 'dm-1', role: 'dm' });
      const char1 = {
        id: 'c1',
        user_id: 'dm-1',
        name: 'Goblin 1',
        hp: 10,
        max_hp: 10,
        ac: 12,
        notes: '',
      };
      const char2 = {
        id: 'c2',
        user_id: 'player-1',
        name: 'Aria',
        hp: 20,
        max_hp: 20,
        ac: 14,
        notes: '',
      };
      vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([char1, char2]);

      await renderGamePage('/game/room-123');

      // DM sees Goblin 1 selected
      expect(container.querySelector('.character-card-name').textContent).toBe('Goblin 1');

      // Remote socket event arrives for Aria (char2) with HP 14
      await act(async () => {
        socketListeners.characterUpdated({
          ...char2,
          room_id: 'room-123',
          hp: 14,
        });
      });

      // Goblin 1 remains selected on screen!
      expect(container.querySelector('.character-card-name').textContent).toBe('Goblin 1');
      expect(container.querySelector('input[name="currentHp"]').value).toBe('10');

      // Switch picker to Aria
      const picker = container.querySelector('#character-card-picker');
      await act(async () => {
        picker.value = 'c2';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Aria reflects the updated HP (14)
      expect(container.querySelector('.character-card-name').textContent).toBe('Aria');
      expect(container.querySelector('input[name="currentHp"]').value).toBe('14');
    });

    it('preserves saved HP and shows sync warning when socket notification fails', async () => {
      const mockSocket = { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() };
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: mockSocket,
        isReady: true,
        error: null,
      });
      prepareCharacterTest({ userId: 'player-1', role: 'player' });
      const aria = {
        id: 'char-1',
        user_id: 'player-1',
        name: 'Aria',
        hp: 10,
        max_hp: 15,
        ac: 14,
        notes: '',
      };
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(aria);
      vi.spyOn(charactersLib, 'updateCharacterHp').mockResolvedValue({ ...aria, hp: 8 });
      vi.spyOn(charactersLib, 'emitCharacterUpdated').mockRejectedValue(
        new Error('Socket timeout'),
      );

      await renderGamePage('/game/room-123');

      const hpInput = container.querySelector('input[name="currentHp"]');
      const hpForm = container.querySelector('form.character-hp-form');

      await act(async () => {
        setInputValue(hpInput, '8');
      });
      await act(async () => {
        hpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // Saved state is preserved on card
      expect(hpInput.value).toBe('8');

      // Top bar shows sync warning
      expect(container.querySelector('.game-top-bar .auth-error').textContent).toMatch(
        /failed to sync update with other players/i,
      );
    });

    it('does not allow an in-flight save on an old room to corrupt a newly navigated room', async () => {
      const mockSocket = { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() };
      vi.spyOn(useRoomSocketModule, 'useRoomSocket').mockReturnValue({
        socket: mockSocket,
        isReady: true,
        error: null,
      });
      prepareCharacterTest({ userId: 'player-1', role: 'player' });
      const aria = {
        id: 'char-1',
        user_id: 'player-1',
        name: 'Aria',
        hp: 10,
        max_hp: 15,
        ac: 14,
        notes: '',
      };
      vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(aria);

      let resolveSave;
      vi.spyOn(charactersLib, 'updateCharacterHp').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          }),
      );
      vi.spyOn(charactersLib, 'emitCharacterUpdated').mockResolvedValue({ ok: true });

      let navigateFn;
      function NavWatcher() {
        navigateFn = useNavigate();
        return null;
      }

      await renderGamePage('/game/room-1', <NavWatcher />);

      const hpInput = container.querySelector('input[name="currentHp"]');
      const hpForm = container.querySelector('form.character-hp-form');

      await act(async () => {
        setInputValue(hpInput, '4');
      });
      await act(async () => {
        hpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // Navigate to room-2 while save is in flight
      await act(async () => {
        navigateFn('/game/room-2');
      });

      // Room-1 save completes now
      await act(async () => {
        resolveSave({ ...aria, hp: 4 });
      });

      // Socket emit was not called for the new room
      expect(charactersLib.emitCharacterUpdated).not.toHaveBeenCalledWith(
        mockSocket,
        expect.objectContaining({ roomId: 'room-2' }),
      );
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
});
