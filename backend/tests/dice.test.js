import { describe, expect, it } from 'vitest';
import { rollDice } from '../src/utils/dice.js';

describe('rollDice', () => {
  it('returns an integer from 1 through the requested number of sides', () => {
    const result = rollDice(20);

    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(20);
  });

  it.each([0, -6, 1.5, '20', null])('throws for invalid sides: %s', (sides) => {
    expect(() => rollDice(sides)).toThrow();
  });
});
