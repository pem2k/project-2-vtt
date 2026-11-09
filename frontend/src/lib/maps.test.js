import { describe, expect, it, vi } from 'vitest';
import { getActiveMap, validateMapFile } from './maps.js';

describe('validateMapFile (#7)', () => {
  it('rejects null or missing file', () => {
    expect(validateMapFile(null)).toBe('Please select an image file to upload.');
    expect(validateMapFile(undefined)).toBe('Please select an image file to upload.');
  });

  it('rejects non-image MIME types', () => {
    const textFile = { name: 'notes.txt', type: 'text/plain', size: 1024 };
    const pdfFile = { name: 'character.pdf', type: 'application/pdf', size: 2048 };
    const exeFile = { name: 'game.exe', type: 'application/x-msdownload', size: 5000 };

    expect(validateMapFile(textFile)).toBe(
      'Invalid file type. Only image files (PNG, JPG, WebP) are allowed.',
    );
    expect(validateMapFile(pdfFile)).toBe(
      'Invalid file type. Only image files (PNG, JPG, WebP) are allowed.',
    );
    expect(validateMapFile(exeFile)).toBe(
      'Invalid file type. Only image files (PNG, JPG, WebP) are allowed.',
    );
  });

  it('accepts valid image MIME types', () => {
    const png = { name: 'dungeon.png', type: 'image/png', size: 50000 };
    const jpeg = { name: 'tavern.jpg', type: 'image/jpeg', size: 60000 };
    const webp = { name: 'forest.webp', type: 'image/webp', size: 40000 };

    expect(validateMapFile(png)).toBeNull();
    expect(validateMapFile(jpeg)).toBeNull();
    expect(validateMapFile(webp)).toBeNull();
  });
});

describe('getActiveMap', () => {
  it('returns null when room has no active_map_id', async () => {
    const fakeSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { active_map_id: null }, error: null }),
      }),
    };

    const map = await getActiveMap(fakeSupabase, 'room-1');
    expect(map).toBeNull();
  });

  it('propagates room query failure instead of returning null', async () => {
    const fakeSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: null, error: new Error('Database connection failed') }),
      }),
    };

    await expect(getActiveMap(fakeSupabase, 'room-1')).rejects.toThrow(
      'Database connection failed',
    );
  });

  it('propagates map record query failure instead of returning null', async () => {
    const fakeSupabase = {
      from: vi.fn((table) => {
        if (table === 'rooms') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { active_map_id: 'map-123' }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('Map row not found') }),
        };
      }),
    };

    await expect(getActiveMap(fakeSupabase, 'room-1')).rejects.toThrow('Map row not found');
  });

  it('returns active map on success', async () => {
    const mapRow = { id: 'map-123', name: 'Dungeon', url: 'https://dungeon.png' };
    const fakeSupabase = {
      from: vi.fn((table) => {
        if (table === 'rooms') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { active_map_id: 'map-123' }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mapRow, error: null }),
        };
      }),
    };

    await expect(getActiveMap(fakeSupabase, 'room-1')).resolves.toEqual(mapRow);
  });
});
