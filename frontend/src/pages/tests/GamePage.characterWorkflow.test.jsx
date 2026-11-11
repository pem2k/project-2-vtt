import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterTab from '../../components/CharacterTab.jsx';
import * as tokensLib from '../../lib/tokens.js';
import * as charactersLib from '../../lib/characters.js';
import { supabase } from '../../lib/supabaseClient.js';
import * as useRoomSocketModule from '../../hooks/useRoomSocket.js';
import { createGamePageHarness } from '../../test/gamePageHarness.jsx';
vi.mock('../../components/board/Board.jsx', () => ({ default: () => <div data-testid="board" /> }));
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

describe('Character workflow and HP live synchronization (#14)', () => {
  let harness;
  beforeEach(() => {
    harness = createGamePageHarness();
    vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);
    vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);
  });
  afterEach(async () => {
    await harness.cleanup();
  });

  function prepareCharacterTest(options = {}) {
    harness.mockAuthenticatedGame(options);
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

    await harness.render('/game/room-123');

    // Form is available initially
    expect(harness.container.querySelector('.character-create-section')).not.toBeNull();
    const nameInput = harness.container.querySelector('#character-name');
    const maxHpInput = harness.container.querySelector('#character-max-hp');
    const acInput = harness.container.querySelector('#character-ac');
    const form = harness.container.querySelector('form.character-card-form');

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
    expect(harness.container.querySelector('.character-card-name').textContent).toBe('Goblin 1');

    // Form inputs are cleared
    expect(nameInput.value).toBe('');
    expect(maxHpInput.value).toBe('');
    expect(acInput.value).toBe('');

    // Form is STILL available for DM!
    expect(harness.container.querySelector('.character-create-section')).not.toBeNull();

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
    expect(harness.container.querySelector('.character-card-name').textContent).toBe('Goblin 2');

    // Form inputs cleared again
    expect(nameInput.value).toBe('');
    expect(maxHpInput.value).toBe('');
    expect(acInput.value).toBe('');

    // Both characters present in picker
    const picker = harness.container.querySelector('#character-card-picker');
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

    await harness.render('/game/room-123');

    const nameInput = harness.container.querySelector('#character-name');
    const maxHpInput = harness.container.querySelector('#character-max-hp');
    const acInput = harness.container.querySelector('#character-ac');
    const form = harness.container.querySelector('form.character-card-form');

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
    const alerts = harness.container.querySelectorAll('.auth-error');
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

    await harness.render('/game/room-123');

    const hpInput = harness.container.querySelector('input[name="currentHp"]');
    const hpForm = harness.container.querySelector('form.character-hp-form');

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

    await harness.render('/game/room-123');

    const hpInput = harness.container.querySelector('input[name="currentHp"]');
    const hpForm = harness.container.querySelector('form.character-hp-form');

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

    await harness.render('/game/room-123');

    // DM sees Goblin 1 selected
    expect(harness.container.querySelector('.character-card-name').textContent).toBe('Goblin 1');

    // Remote socket event arrives for Aria (char2) with HP 14
    await act(async () => {
      socketListeners.characterUpdated({
        ...char2,
        room_id: 'room-123',
        hp: 14,
      });
    });

    // Goblin 1 remains selected on screen!
    expect(harness.container.querySelector('.character-card-name').textContent).toBe('Goblin 1');
    expect(harness.container.querySelector('input[name="currentHp"]').value).toBe('10');

    // Switch picker to Aria
    const picker = harness.container.querySelector('#character-card-picker');
    await act(async () => {
      picker.value = 'c2';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Aria reflects the updated HP (14)
    expect(harness.container.querySelector('.character-card-name').textContent).toBe('Aria');
    expect(harness.container.querySelector('input[name="currentHp"]').value).toBe('14');
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
    vi.spyOn(charactersLib, 'emitCharacterUpdated').mockRejectedValue(new Error('Socket timeout'));

    await harness.render('/game/room-123');

    const hpInput = harness.container.querySelector('input[name="currentHp"]');
    const hpForm = harness.container.querySelector('form.character-hp-form');

    await act(async () => {
      setInputValue(hpInput, '8');
    });
    await act(async () => {
      hpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // Saved state is preserved on card
    expect(hpInput.value).toBe('8');

    // Top bar shows sync warning
    expect(harness.container.querySelector('.game-top-bar .auth-error').textContent).toMatch(
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

    await harness.render('/game/room-1');

    const hpInput = harness.container.querySelector('input[name="currentHp"]');
    const hpForm = harness.container.querySelector('form.character-hp-form');

    await act(async () => {
      setInputValue(hpInput, '4');
    });
    await act(async () => {
      hpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // Navigate to room-2 while save is in flight
    await harness.navigate('/game/room-2');

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
