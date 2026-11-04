import { describe, expect, it, vi } from 'vitest';
import {
  TOKEN_COLORS,
  validateTokenInput,
  upsertToken,
  removeTokenById,
  getRoomTokens,
  addToken,
  removeToken,
  assignToken,
} from './tokens.js';

describe('tokens library', () => {
  describe('TOKEN_COLORS', () => {
    it('provides the standard 8-color palette from design.md', () => {
      expect(TOKEN_COLORS).toHaveLength(8);
      expect(TOKEN_COLORS.map((c) => c.hex)).toEqual([
        '#E6194B',
        '#4363D8',
        '#3CB44B',
        '#F58231',
        '#911EB4',
        '#469990',
        '#FFE119',
        '#F032E6',
      ]);
    });
  });

  describe('validateTokenInput', () => {
    it('rejects empty or whitespace-only name', () => {
      expect(validateTokenInput({ name: '', color: '#E6194B' })).toBe('Token name is required.');
      expect(validateTokenInput({ name: '   ', color: '#E6194B' })).toBe('Token name is required.');
    });

    it('rejects name exceeding 40 characters', () => {
      const longName = 'A'.repeat(41);
      expect(validateTokenInput({ name: longName, color: '#E6194B' })).toBe(
        'Token name must be between 1 and 40 characters.',
      );
    });

    it('rejects invalid hex color format', () => {
      expect(validateTokenInput({ name: 'Goblin', color: 'red' })).toBe(
        'Color must be a valid 6-digit hex code.',
      );
      expect(validateTokenInput({ name: 'Goblin', color: '#FFF' })).toBe(
        'Color must be a valid 6-digit hex code.',
      );
      expect(validateTokenInput({ name: 'Goblin', color: '#GGGGGG' })).toBe(
        'Color must be a valid 6-digit hex code.',
      );
    });

    it('accepts valid name and color', () => {
      expect(validateTokenInput({ name: 'Goblin Scout', color: '#E6194B' })).toBeNull();
      expect(validateTokenInput({ name: '  Aria  ', color: '#4363d8' })).toBeNull();
    });
  });

  describe('upsertToken and removeTokenById pure helpers', () => {
    it('appends a new token without mutating the original list', () => {
      const initial = [{ id: '1', name: 'Aria' }];
      const result = upsertToken(initial, { id: '2', name: 'Goblin' });
      expect(result).toHaveLength(2);
      expect(initial).toHaveLength(1);
      expect(result[1]).toEqual({ id: '2', name: 'Goblin' });
    });

    it('replaces an existing token by id (dedupes)', () => {
      const initial = [
        { id: '1', name: 'Aria', color: '#4363D8' },
        { id: '2', name: 'Goblin', color: '#E6194B' },
      ];
      const updated = { id: '2', name: 'Goblin Leader', color: '#F58231' };
      const result = upsertToken(initial, updated);
      expect(result).toHaveLength(2);
      expect(result.find((t) => t.id === '2')).toEqual(updated);
    });

    it('removes a token by id without mutating the original list', () => {
      const initial = [
        { id: '1', name: 'Aria' },
        { id: '2', name: 'Goblin' },
      ];
      const result = removeTokenById(initial, '1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
      expect(initial).toHaveLength(2);
    });
  });

  describe('addToken and removeToken against Supabase client', () => {
    it('addToken validates input and inserts at x:0, y:0, returning the created row', async () => {
      const fakeSingle = vi.fn().mockResolvedValue({
        data: { id: 'token-123', room_id: 'room-1', name: 'Rogue', color: '#4363D8', x: 0, y: 0 },
        error: null,
      });
      const fakeSelect = vi.fn(() => ({ single: fakeSingle }));
      const fakeInsert = vi.fn(() => ({ select: fakeSelect }));
      const fakeSupabase = {
        from: vi.fn(() => ({ insert: fakeInsert })),
      };

      const result = await addToken(fakeSupabase, {
        roomId: 'room-1',
        name: '  Rogue  ',
        color: '#4363D8',
      });

      expect(fakeSupabase.from).toHaveBeenCalledWith('tokens');
      expect(fakeInsert).toHaveBeenCalledWith({
        room_id: 'room-1',
        name: 'Rogue',
        color: '#4363D8',
        x: 0,
        y: 0,
      });
      expect(result).toEqual({
        id: 'token-123',
        room_id: 'room-1',
        name: 'Rogue',
        color: '#4363D8',
        x: 0,
        y: 0,
      });
    });

    it('addToken throws error when validation fails or supabase returns error', async () => {
      const fakeSupabase = { from: vi.fn() };
      await expect(
        addToken(fakeSupabase, { roomId: 'room-1', name: '', color: '#4363D8' }),
      ).rejects.toThrow('Token name is required.');

      const failSingle = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('RLS violation'),
      });
      const failSupabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: failSingle })),
          })),
        })),
      };

      await expect(
        addToken(failSupabase, { roomId: 'room-1', name: 'Valid', color: '#4363D8' }),
      ).rejects.toThrow('RLS violation');
    });

    it('removeToken deletes by id and throws on error', async () => {
      const fakeEq = vi.fn().mockResolvedValue({ error: null });
      const fakeDelete = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ delete: fakeDelete })),
      };

      await removeToken(fakeSupabase, 'token-123');
      expect(fakeSupabase.from).toHaveBeenCalledWith('tokens');
      expect(fakeDelete).toHaveBeenCalled();
      expect(fakeEq).toHaveBeenCalledWith('id', 'token-123');

      const failEq = vi.fn().mockResolvedValue({ error: new Error('Delete failed') });
      const failSupabase = {
        from: vi.fn(() => ({ delete: vi.fn(() => ({ eq: failEq })) })),
      };
      await expect(removeToken(failSupabase, 'token-123')).rejects.toThrow('Delete failed');
    });

    it('getRoomTokens fetches tokens ordered by created_at ascending', async () => {
      const fakeOrder = vi.fn().mockResolvedValue({
        data: [{ id: '1', name: 'Goblin' }],
        error: null,
      });
      const fakeEq = vi.fn(() => ({ order: fakeOrder }));
      const fakeSelect = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ select: fakeSelect })),
      };

      const result = await getRoomTokens(fakeSupabase, 'room-1');
      expect(fakeSupabase.from).toHaveBeenCalledWith('tokens');
      expect(fakeSelect).toHaveBeenCalledWith('*');
      expect(fakeEq).toHaveBeenCalledWith('room_id', 'room-1');
      expect(fakeOrder).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(result).toEqual([{ id: '1', name: 'Goblin' }]);
    });

    it('assignToken updates assigned_to with userId and returns the updated token', async () => {
      const updatedRow = { id: 'token-1', name: 'Aria', assigned_to: 'user-123' };
      const fakeSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
      const fakeSelect = vi.fn(() => ({ single: fakeSingle }));
      const fakeEq = vi.fn(() => ({ select: fakeSelect }));
      const fakeUpdate = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ update: fakeUpdate })),
      };

      const result = await assignToken(fakeSupabase, {
        tokenId: 'token-1',
        userId: 'user-123',
      });

      expect(fakeSupabase.from).toHaveBeenCalledWith('tokens');
      expect(fakeUpdate).toHaveBeenCalledWith({ assigned_to: 'user-123' });
      expect(fakeEq).toHaveBeenCalledWith('id', 'token-1');
      expect(fakeSelect).toHaveBeenCalled();
      expect(fakeSingle).toHaveBeenCalled();
      expect(result).toEqual(updatedRow);
    });

    it('assignToken passes null through when userId is null or omitted', async () => {
      const updatedRow = { id: 'token-1', name: 'Aria', assigned_to: null };
      const fakeSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
      const fakeSelect = vi.fn(() => ({ single: fakeSingle }));
      const fakeEq = vi.fn(() => ({ select: fakeSelect }));
      const fakeUpdate = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ update: fakeUpdate })),
      };

      const result = await assignToken(fakeSupabase, {
        tokenId: 'token-1',
        userId: null,
      });

      expect(fakeUpdate).toHaveBeenCalledWith({ assigned_to: null });
      expect(result).toEqual(updatedRow);
    });

    it('assignToken throws error when update fails', async () => {
      const fakeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error('Update failed') });
      const fakeSelect = vi.fn(() => ({ single: fakeSingle }));
      const fakeEq = vi.fn(() => ({ select: fakeSelect }));
      const fakeUpdate = vi.fn(() => ({ eq: fakeEq }));
      const fakeSupabase = {
        from: vi.fn(() => ({ update: fakeUpdate })),
      };

      await expect(
        assignToken(fakeSupabase, { tokenId: 'token-1', userId: 'user-1' }),
      ).rejects.toThrow('Update failed');
    });
  });
});
