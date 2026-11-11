import CharacterTab from '../../components/CharacterTab.jsx';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tokensLib from '../../lib/tokens.js';
import * as charactersLib from '../../lib/characters.js';
import { createGamePageHarness, deferred } from '../../test/gamePageHarness.jsx';

vi.mock('../../components/board/Board.jsx', () => ({
  default: () => <div data-testid="board" />,
}));

vi.mock('../../components/ChatPanel.jsx', () => ({
  default: () => <div data-testid="chat-panel" />,
}));

vi.mock('../../components/SettingsPanel.jsx', () => ({
  default: (props) => (
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
  ),
}));

describe('GamePage character workflows and synchronization', () => {
  let harness;

  beforeEach(() => {
    harness = createGamePageHarness();
    vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValue([]);
  });

  afterEach(async () => {
    if (harness) {
      await harness.cleanup();
      harness = null;
    }
  });

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
    const { container } = harness;
    return {
      name: container.querySelector('.character-card-name')?.textContent ?? '',
      stats: [...container.querySelectorAll('.character-card-stat')].map(
        (node) => node.textContent,
      ),
      notes: container.querySelector('.character-card-notes')?.textContent ?? '',
      loading: container.querySelector('.character-card-loading') !== null,
    };
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
    const picker = harness.container.querySelector('#character-card-picker');
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
    harness.setupMockRoomSocket();
    harness.mockAuthenticatedGame({ userId: 'dm-1', role: 'dm', roomName: 'Sword Coast' });
    const cast = dmCast();
    const spy = vi
      .spyOn(charactersLib, 'getRoomCharacters')
      .mockImplementation(() => onFetch(cast));
    vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);

    await harness.render('/game/room-123');
    expect(readCard().name).toBe('Aria');
    await chooseCharacter('char-bruenor');
    expect(readCard().name).toBe('Bruenor');
    expect(readCard().notes).toBe('Dwarf');

    return { ...cast, spy };
  }

  async function rejoin(roomId = 'room-123') {
    await act(async () => {
      await harness.triggerOnJoined(roomId);
    });
  }

  it('reloads a player character when onJoined fires again without the loading flash', async () => {
    harness.setupMockRoomSocket();
    harness.mockAuthenticatedGame({ userId: 'user-1', role: 'player', roomName: 'Icewind Dale' });

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

    await harness.render('/game/room-123');
    expect(readCard()).toMatchObject({ name: 'Aria', notes: 'Scout', loading: false });
    expect(readCard().stats).toContain('HP 10 / 12');

    // First join callback, then a second call for the reconnect.
    phase = 'first';
    await rejoin('room-123');

    phase = 'second';
    await act(async () => {
      harness.triggerOnJoined('room-123');
    });

    // The card stays up while the second refetch is in flight.
    expect(readCard().loading).toBe(false);
    expect(harness.container.textContent).not.toContain('Loading character...');

    await act(async () => {
      secondReload.resolve(rejoined);
      await secondReload.promise;
    });

    const card = readCard();
    expect(card.loading).toBe(false);
    expect(harness.container.textContent).not.toContain('Loading character...');
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
      harness.triggerOnJoined('room-123');
    });

    expect(readCard().loading).toBe(false);
    expect(readCard().name).toBe('Bruenor');
    expect(harness.container.textContent).not.toContain('Loading character...');

    await act(async () => {
      reload.resolve([
        { ...session.aria, hp: 19 },
        { ...session.bruenor, hp: 12, notes: 'Wounded' },
        session.drizzt,
      ]);
      await reload.promise;
    });

    const card = readCard();
    expect(card.loading).toBe(false);
    expect(card.name).toBe('Bruenor');
    expect(card.notes).toBe('Wounded');
    expect(card.stats).toContain('HP 12 / 40');
    expect(harness.container.querySelector('#character-card-picker')?.value).toBe('char-bruenor');
  });

  it.each([
    {
      scenario: 'falls back to the DM own character when the selected character is gone',
      getRefreshedList: (cast) => [
        { ...cast.drizzt, hp: 9 },
        { ...cast.aria, hp: 15, notes: 'Still here' },
      ],
      expected: { name: 'Aria', notes: 'Still here', hpStat: 'HP 15 / 20' },
    },
    {
      scenario: 'falls back to the first character when the selection and the DM own card are gone',
      getRefreshedList: (cast) => [
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
      ],
      expected: { name: 'Drizzt', notes: 'First', hpStat: 'HP 9 / 18' },
    },
  ])('$scenario', async ({ getRefreshedList, expected }) => {
    let phase = 'mount';
    await openDmWithBruenorSelected((cast) => {
      if (phase === 'reload') {
        return Promise.resolve(getRefreshedList(cast));
      }
      return Promise.resolve(cast.list);
    });

    phase = 'reload';
    await rejoin('room-123');

    const card = readCard();
    expect(card.loading).toBe(false);
    expect(card.name).toBe(expected.name);
    expect(card.notes).toBe(expected.notes);
    expect(card.stats).toContain(expected.hpStat);
    expect(harness.container.textContent).not.toContain('Loading character...');
  });

  it('ignores an older character reload superseded by a newer join', async () => {
    harness.setupMockRoomSocket();
    harness.mockAuthenticatedGame({ userId: 'user-1', role: 'player', roomName: 'Neverwinter' });

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

    await harness.render('/game/room-123');
    expect(readCard().notes).toBe('Scout');

    phase = 'stale';
    await act(async () => {
      harness.triggerOnJoined('room-123');
    });

    phase = 'fresh';
    await act(async () => {
      harness.triggerOnJoined('room-123');
    });

    expect(readCard().loading).toBe(false);

    await act(async () => {
      freshReload.resolve(fresh);
      await freshReload.promise;
    });

    expect(readCard().notes).toBe('Fresh');
    expect(readCard().stats).toContain('HP 2 / 12');

    await act(async () => {
      staleReload.resolve(stale);
      await staleReload.promise;
    });

    expect(readCard().notes).toBe('Fresh');
    expect(readCard().stats).toContain('HP 2 / 12');
    expect(harness.container.textContent).not.toContain('Stale');
  });

  it('ignores a character reload that resolves after leaving the room', async () => {
    harness.setupMockRoomSocket();
    harness.mockAuthenticatedGame({
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

    await harness.render('/game/room-a');
    expect(readCard().name).toBe('Alpha');

    roomAPhase = 'reload';
    await act(async () => {
      harness.triggerOnJoined('room-a');
    });

    expect(readCard().loading).toBe(false);
    expect(readCard().name).toBe('Alpha');

    await harness.navigate('/game/room-b');

    expect(readCard().name).toBe('Beta');
    expect(readCard().notes).toBe('Posted');

    await act(async () => {
      roomAReload.resolve(staleAlpha);
      await roomAReload.promise;
    });

    expect(readCard().name).toBe('Beta');
    expect(harness.container.textContent).not.toContain('Old room');

    roomBPhase = 'reload';
    await rejoin('room-b');

    const card = readCard();
    expect(card.loading).toBe(false);
    expect(card.name).toBe('Beta');
    expect(card.notes).toBe('Rested');
    expect(card.stats).toContain('HP 3 / 9');
    expect(harness.container.textContent).not.toContain('Old room');
  });

  it('keeps the visible character when a player character reload fails', async () => {
    harness.setupMockRoomSocket();
    harness.mockAuthenticatedGame({ userId: 'user-1', role: 'player', roomName: 'Icewind Dale' });

    const initial = makeCharacter({ hp: 10, notes: 'Scout' });
    let failReload = false;
    const spy = vi.spyOn(charactersLib, 'getMyCharacter').mockImplementation(() => {
      if (failReload) return Promise.reject(new Error('Network drop during character reload'));
      return Promise.resolve(initial);
    });
    vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);

    await harness.render('/game/room-123');
    expect(readCard()).toMatchObject({ name: 'Aria', notes: 'Scout', loading: false });
    const fetchesAfterMount = spy.mock.calls.length;

    failReload = true;
    await act(async () => {
      try {
        await harness.triggerOnJoined('room-123');
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
    expect(harness.container.textContent).not.toContain('Loading character...');
    expect(harness.container.textContent).not.toContain('Create character');
    expect(harness.container.textContent).not.toContain('Unable to load characters.');
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
        await harness.triggerOnJoined('room-123');
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
    expect(harness.container.querySelector('#character-card-picker')?.value).toBe('char-bruenor');
    expect(harness.container.textContent).not.toContain('Loading character...');
    expect(harness.container.textContent).not.toContain('Unable to load characters.');
  });
});
