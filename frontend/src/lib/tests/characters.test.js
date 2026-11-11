import { describe, expect, it, vi } from 'vitest';
import {
  validateCharacterInput,
  validateHpInput,
  getRoomCharacters,
  getMyCharacter,
  createCharacter,
  updateCharacterHp,
  upsertCharacter,
  reconcileCharacters,
  emitCharacterUpdated,
  toFriendlyCharacterError,
  KNOWN_CHARACTER_ERRORS,
  CHARACTER_VALIDATION_MESSAGES,
} from '../characters.js';

describe('characters library', () => {
  describe('validateCharacterInput', () => {
    it('rejects empty or whitespace-only name', () => {
      expect(validateCharacterInput({ name: '', maxHp: 10, ac: 15 })).toBe(
        'Character name is required.',
      );
      expect(validateCharacterInput({ name: '   ', maxHp: 10, ac: 15 })).toBe(
        'Character name is required.',
      );
    });

    it('rejects name exceeding 40 characters', () => {
      const longName = 'A'.repeat(41);
      expect(validateCharacterInput({ name: longName, maxHp: 10, ac: 15 })).toBe(
        'Character name must be between 1 and 40 characters.',
      );
    });

    it('rejects non-integer or zero/negative max HP', () => {
      expect(validateCharacterInput({ name: 'Aria', maxHp: 0, ac: 15 })).toBe(
        'Max HP must be an integer of at least 1.',
      );
      expect(validateCharacterInput({ name: 'Aria', maxHp: -5, ac: 15 })).toBe(
        'Max HP must be an integer of at least 1.',
      );
      expect(validateCharacterInput({ name: 'Aria', maxHp: 3.5, ac: 15 })).toBe(
        'Max HP must be an integer of at least 1.',
      );
      expect(validateCharacterInput({ name: 'Aria', maxHp: 'ten', ac: 15 })).toBe(
        'Max HP must be an integer of at least 1.',
      );
    });

    it('rejects non-integer or negative AC', () => {
      expect(validateCharacterInput({ name: 'Aria', maxHp: 10, ac: -1 })).toBe(
        'AC must be an integer of at least 0.',
      );
      expect(validateCharacterInput({ name: 'Aria', maxHp: 10, ac: 2.5 })).toBe(
        'AC must be an integer of at least 0.',
      );
      expect(validateCharacterInput({ name: 'Aria', maxHp: 10, ac: 'high' })).toBe(
        'AC must be an integer of at least 0.',
      );
    });

    it('accepts valid input including AC of 0', () => {
      expect(validateCharacterInput({ name: 'Aria', maxHp: 12, ac: 15 })).toBeNull();
      expect(validateCharacterInput({ name: '  Rogue  ', maxHp: 1, ac: 0 })).toBeNull();
    });
  });

  describe('getRoomCharacters', () => {
    it('fetches all characters for a room ordered by created_at ascending', async () => {
      const fakeOrder = vi.fn().mockResolvedValue({
        data: [
          { id: 'c1', name: 'Aria', hp: 12, max_hp: 12, ac: 15, notes: '' },
          { id: 'c2', name: 'Gobbo', hp: 7, max_hp: 10, ac: 10, notes: 'sneaky' },
        ],
        error: null,
      });
      const fakeEq = vi.fn(() => ({ order: fakeOrder }));
      const fakeSelect = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ select: fakeSelect })),
      };

      const result = await getRoomCharacters(fakeSupabase, 'room-1');
      expect(fakeSupabase.from).toHaveBeenCalledWith('characters');
      expect(fakeSelect).toHaveBeenCalledWith('*');
      expect(fakeEq).toHaveBeenCalledWith('room_id', 'room-1');
      expect(fakeOrder).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Aria');
    });

    it('throws when supabase returns an error', async () => {
      const fakeOrder = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('RLS denied'),
      });
      const fakeEq = vi.fn(() => ({ order: fakeOrder }));
      const fakeSelect = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ select: fakeSelect })),
      };

      await expect(getRoomCharacters(fakeSupabase, 'room-1')).rejects.toThrow('RLS denied');
    });
  });

  describe('getMyCharacter', () => {
    it('returns the character for the given user and room', async () => {
      const character = { id: 'c1', name: 'Aria', hp: 12, max_hp: 12, ac: 15, notes: '' };
      const fakeMaybeSingle = vi.fn().mockResolvedValue({ data: character, error: null });
      const fakeEqUser = vi.fn(() => ({ maybeSingle: fakeMaybeSingle }));
      const fakeEqRoom = vi.fn(() => ({ eq: fakeEqUser }));
      const fakeSelect = vi.fn(() => ({ eq: fakeEqRoom }));
      const fakeSupabase = {
        from: vi.fn(() => ({ select: fakeSelect })),
      };

      const result = await getMyCharacter(fakeSupabase, 'room-1', 'user-1');
      expect(fakeSupabase.from).toHaveBeenCalledWith('characters');
      expect(fakeSelect).toHaveBeenCalledWith('*');
      expect(fakeEqRoom).toHaveBeenCalledWith('room_id', 'room-1');
      expect(fakeEqUser).toHaveBeenCalledWith('user_id', 'user-1');
      expect(result).toEqual(character);
    });

    it('returns null when no character exists', async () => {
      const fakeMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const fakeEqUser = vi.fn(() => ({ maybeSingle: fakeMaybeSingle }));
      const fakeEqRoom = vi.fn(() => ({ eq: fakeEqUser }));
      const fakeSelect = vi.fn(() => ({ eq: fakeEqRoom }));
      const fakeSupabase = {
        from: vi.fn(() => ({ select: fakeSelect })),
      };

      const result = await getMyCharacter(fakeSupabase, 'room-1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('createCharacter', () => {
    it('inserts a character with hp equal to maxHp and returns the created row', async () => {
      const createdRow = {
        id: 'c-new',
        room_id: 'room-1',
        user_id: 'user-1',
        name: 'Rogue',
        hp: 10,
        max_hp: 10,
        ac: 14,
        notes: '',
      };
      const fakeSingle = vi.fn().mockResolvedValue({ data: createdRow, error: null });
      const fakeSelect = vi.fn(() => ({ single: fakeSingle }));
      const fakeInsert = vi.fn(() => ({ select: fakeSelect }));
      const fakeSupabase = {
        from: vi.fn(() => ({ insert: fakeInsert })),
      };

      const result = await createCharacter(fakeSupabase, {
        roomId: 'room-1',
        userId: 'user-1',
        name: '  Rogue  ',
        maxHp: 10,
        ac: 14,
      });

      expect(fakeSupabase.from).toHaveBeenCalledWith('characters');
      expect(fakeInsert).toHaveBeenCalledWith({
        room_id: 'room-1',
        user_id: 'user-1',
        name: 'Rogue',
        hp: 10,
        max_hp: 10,
        ac: 14,
        notes: '',
      });
      expect(result).toEqual(createdRow);
    });

    it('throws validation error for invalid input', async () => {
      const fakeSupabase = { from: vi.fn() };
      await expect(
        createCharacter(fakeSupabase, {
          roomId: 'room-1',
          userId: 'user-1',
          name: '',
          maxHp: 10,
          ac: 14,
        }),
      ).rejects.toThrow('Character name is required.');
    });

    it('throws when supabase returns an error', async () => {
      const fakeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error('Insert failed') });
      const fakeSelect = vi.fn(() => ({ single: fakeSingle }));
      const fakeInsert = vi.fn(() => ({ select: fakeSelect }));
      const fakeSupabase = {
        from: vi.fn(() => ({ insert: fakeInsert })),
      };

      await expect(
        createCharacter(fakeSupabase, {
          roomId: 'room-1',
          userId: 'user-1',
          name: 'Rogue',
          maxHp: 10,
          ac: 14,
        }),
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('validateHpInput', () => {
    it('rejects blank, non-integer, or decimal values', () => {
      expect(validateHpInput('', 20)).toBe('Current HP is required.');
      expect(validateHpInput('   ', 20)).toBe('Current HP is required.');
      expect(validateHpInput('abc', 20)).toBe('Current HP must be an integer.');
      expect(validateHpInput('12.5', 20)).toBe('Current HP must be an integer.');
      expect(validateHpInput(NaN, 20)).toBe('Current HP must be an integer.');
    });

    it('rejects values less than 0 or greater than maxHp', () => {
      expect(validateHpInput(-1, 20)).toBe('Current HP must be between 0 and 20.');
      expect(validateHpInput('-5', 20)).toBe('Current HP must be between 0 and 20.');
      expect(validateHpInput(21, 20)).toBe('Current HP must be between 0 and 20.');
      expect(validateHpInput('25', 20)).toBe('Current HP must be between 0 and 20.');
    });

    it('accepts valid integers within range [0, maxHp]', () => {
      expect(validateHpInput(0, 20)).toBeNull();
      expect(validateHpInput('0', 20)).toBeNull();
      expect(validateHpInput(10, 20)).toBeNull();
      expect(validateHpInput('10', 20)).toBeNull();
      expect(validateHpInput(20, 20)).toBeNull();
      expect(validateHpInput('20', 20)).toBeNull();
    });
  });

  describe('updateCharacterHp', () => {
    it('uses update_character RPC for player', async () => {
      const updatedRow = { id: 'c1', hp: 7, max_hp: 20, name: 'Aria' };
      const fakeRpc = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
      const fakeSupabase = { rpc: fakeRpc };

      const result = await updateCharacterHp(fakeSupabase, {
        characterId: 'c1',
        hp: 7,
        isDM: false,
      });

      expect(fakeRpc).toHaveBeenCalledWith('update_character', {
        p_character_id: 'c1',
        p_hp: 7,
      });
      expect(result).toEqual(updatedRow);
    });

    it('uses direct UPDATE on characters table for DM', async () => {
      const updatedRow = { id: 'c2', hp: 5, max_hp: 15, name: 'Goblin' };
      const fakeSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
      const fakeSelect = vi.fn(() => ({ single: fakeSingle }));
      const fakeEq = vi.fn(() => ({ select: fakeSelect }));
      const fakeUpdate = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ update: fakeUpdate })),
      };

      const result = await updateCharacterHp(fakeSupabase, {
        characterId: 'c2',
        hp: 5,
        isDM: true,
      });

      expect(fakeSupabase.from).toHaveBeenCalledWith('characters');
      expect(fakeUpdate).toHaveBeenCalledWith({ hp: 5 });
      expect(fakeEq).toHaveBeenCalledWith('id', 'c2');
      expect(result).toEqual(updatedRow);
    });

    it('throws validation error when hp is not a valid non-negative integer', async () => {
      const fakeSupabase = { rpc: vi.fn(), from: vi.fn() };
      await expect(
        updateCharacterHp(fakeSupabase, { characterId: 'c1', hp: -1, isDM: false }),
      ).rejects.toThrow('HP must be an integer of at least 0.');
      await expect(
        updateCharacterHp(fakeSupabase, { characterId: 'c1', hp: 3.5, isDM: false }),
      ).rejects.toThrow('HP must be an integer of at least 0.');
    });
  });

  describe('upsertCharacter and reconcileCharacters', () => {
    it('upsertCharacter adds new character or updates existing one by id', () => {
      const list = [
        { id: 'c1', name: 'Aria', hp: 10 },
        { id: 'c2', name: 'Goblin 1', hp: 5 },
      ];
      const updated = upsertCharacter(list, { id: 'c2', name: 'Goblin 1', hp: 3 });
      expect(updated).toHaveLength(2);
      expect(updated[1].hp).toBe(3);

      const added = upsertCharacter(list, { id: 'c3', name: 'Goblin 2', hp: 8 });
      expect(added).toHaveLength(3);
      expect(added[2].name).toBe('Goblin 2');
    });

    it('reconcileCharacters overlays buffered characterUpdated events over snapshot', () => {
      const snapshot = [
        { id: 'c1', name: 'Aria', hp: 20 },
        { id: 'c2', name: 'Goblin', hp: 10 },
      ];
      const buffered = [
        { type: 'characterUpdated', character: { id: 'c1', name: 'Aria', hp: 12 } },
        { type: 'characterUpdated', character: { id: 'c3', name: 'New NPC', hp: 8 } },
      ];
      const result = reconcileCharacters(snapshot, buffered);
      expect(result).toHaveLength(3);
      expect(result.find((c) => c.id === 'c1')?.hp).toBe(12);
      expect(result.find((c) => c.id === 'c2')?.hp).toBe(10);
      expect(result.find((c) => c.id === 'c3')?.name).toBe('New NPC');
    });
  });

  describe('emitCharacterUpdated', () => {
    it('emits characterUpdated with room and character ID and resolves on ok: true', async () => {
      const socket = {
        connected: true,
        emit: vi.fn((event, payload, cb) => cb({ ok: true })),
      };

      const result = await emitCharacterUpdated(socket, {
        roomId: 'room-1',
        characterId: 'char-1',
      });

      expect(socket.emit).toHaveBeenCalledWith(
        'characterUpdated',
        { roomId: 'room-1', characterId: 'char-1' },
        expect.any(Function),
      );
      expect(result).toEqual({ ok: true });
    });

    it('rejects if socket is disconnected', async () => {
      const socket = { connected: false };
      await expect(
        emitCharacterUpdated(socket, { roomId: 'r1', characterId: 'c1' }),
      ).rejects.toThrow(/not connected/i);
    });

    it('rejects on error response from server', async () => {
      const socket = {
        connected: true,
        emit: vi.fn((event, payload, cb) => cb({ ok: false, error: 'Not authorized.' })),
      };
      await expect(
        emitCharacterUpdated(socket, { roomId: 'r1', characterId: 'c1' }),
      ).rejects.toThrow('Not authorized.');
    });
  });

  describe('toFriendlyCharacterError', () => {
    it('preserves recognized application validation messages directly', () => {
      for (const msg of Object.values(CHARACTER_VALIDATION_MESSAGES)) {
        expect(toFriendlyCharacterError(new Error(msg))).toBe(msg);
      }
      expect(toFriendlyCharacterError(new Error('Current HP must be between 0 and 20.'))).toBe(
        'Current HP must be between 0 and 20.',
      );
    });

    it('maps known database error codes and constraints to fixed user-friendly copy', () => {
      // 23514 check constraint or constraint name
      expect(toFriendlyCharacterError({ code: '23514' })).toBe(
        KNOWN_CHARACTER_ERRORS.HP_RANGE_INVALID,
      );
      expect(
        toFriendlyCharacterError(
          new Error('new row violates check constraint "characters_hp_range"'),
        ),
      ).toBe(KNOWN_CHARACTER_ERRORS.HP_RANGE_INVALID);
      expect(toFriendlyCharacterError(new Error('hp must be between 0 and max_hp'))).toBe(
        KNOWN_CHARACTER_ERRORS.HP_RANGE_INVALID,
      );

      // Trigger / RPC exceptions
      expect(
        toFriendlyCharacterError(
          new Error('player 111-uuid already has a character in room 222-uuid'),
        ),
      ).toBe(KNOWN_CHARACTER_ERRORS.ONE_PER_PLAYER);
      expect(
        toFriendlyCharacterError(new Error('user 111-uuid is not a member of room 222-uuid')),
      ).toBe(KNOWN_CHARACTER_ERRORS.ROOM_MEMBER_REQUIRED);
      expect(toFriendlyCharacterError(new Error('not allowed to edit this character'))).toBe(
        KNOWN_CHARACTER_ERRORS.NOT_OWNER,
      );
      expect(toFriendlyCharacterError(new Error('character not found'))).toBe(
        KNOWN_CHARACTER_ERRORS.NOT_FOUND,
      );
    });

    it('replaces unknown errors containing database details with caller fallback without leaking details', () => {
      const dbError = new Error(
        'violates foreign key constraint characters_room_id_fkey on table "characters" (room_id)=(0000-uuid)',
      );
      expect(toFriendlyCharacterError(dbError, 'Unable to create character.')).toBe(
        'Unable to create character.',
      );

      const internalError = new Error('500 internal server error from postgres connection');
      expect(toFriendlyCharacterError(internalError, 'Failed to update HP.')).toBe(
        'Failed to update HP.',
      );
    });
  });
});
