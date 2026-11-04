import { describe, it, expect } from 'vitest';
import { validateMapFile } from './maps.js';

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
