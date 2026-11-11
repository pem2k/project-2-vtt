import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDiceNotation, rollDice } from '../src/utils/dice.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseDiceNotation', () => {
  it('parses valid notation with count, sides, and positive modifier', () => {
    expect(parseDiceNotation('2d6+5')).toEqual({
      count: 2,
      sides: 6,
      modifier: 5,
      notation: '2d6+5',
    });
  });

  it('parses valid notation with negative modifier', () => {
    expect(parseDiceNotation('1d20-2')).toEqual({
      count: 1,
      sides: 20,
      modifier: -2,
      notation: '1d20-2',
    });
  });

  it('defaults count to 1 when omitted', () => {
    expect(parseDiceNotation('d20')).toEqual({
      count: 1,
      sides: 20,
      modifier: 0,
      notation: '1d20',
    });
  });

  it('defaults modifier to 0 when omitted', () => {
    expect(parseDiceNotation('3d8')).toEqual({
      count: 3,
      sides: 8,
      modifier: 0,
      notation: '3d8',
    });
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parseDiceNotation('  4D12 + 7  ')).toEqual({
      count: 4,
      sides: 12,
      modifier: 7,
      notation: '4d12+7',
    });
  });

  it.each(['0d20', '1d7', '1d0', 'd15', '-2d6', '2d6+', '2d6+abc', 'invalid', '', null, undefined])(
    'throws for invalid notation: %s',
    (notation) => {
      expect(() => parseDiceNotation(notation)).toThrow(/invalid.*notation/i);
    },
  );
});

describe('rollDice', () => {
  it('returns an integer from 1 through the requested number of sides when passed a number', () => {
    const result = rollDice(20);

    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(20);
  });

  it('rolls multiple dice individually and applies modifier to total when passed notation', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);

    const result = rollDice('2d6+5');

    expect(result).toEqual({
      notation: '2d6+5',
      count: 2,
      sides: 6,
      rolls: [2, 5],
      modifier: 5,
      total: 12,
    });
  });

  it('correctly handles negative modifier with notation', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);

    const result = rollDice('1d20-2');

    expect(result).toEqual({
      notation: '1d20-2',
      count: 1,
      sides: 20,
      rolls: [11],
      modifier: -2,
      total: 9,
    });
  });

  it('rolls when passed a pre-parsed notation spec object without re-parsing', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
    const parsed = parseDiceNotation('2d6+3');

    const result = rollDice(parsed);

    expect(result).toEqual({
      notation: '2d6+3',
      count: 2,
      sides: 6,
      rolls: [2, 5],
      modifier: 3,
      total: 10,
    });
  });

  it.each([0, -6, 1.5, '20', null])('throws for invalid numeric sides: %s', (sides) => {
    expect(() => rollDice(sides)).toThrow();
  });
});
