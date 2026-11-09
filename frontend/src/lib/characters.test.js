import { describe, expect, it, vi } from 'vitest';
import {
  validateCharacterInput,
  getRoomCharacters,
  getMyCharacter,
  createCharacter,
} from './characters.js';

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
});
