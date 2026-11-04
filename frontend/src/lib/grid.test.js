import { describe, expect, it } from 'vitest';
import { computeGridLines } from './grid.js';

describe('computeGridLines', () => {
  it('computes correct vertical and horizontal grid lines for 100x100 with cellSize 50', () => {
    const lines = computeGridLines({ width: 100, height: 100, cellSize: 50 });

    // Vertical lines at x = 0, 50, 100
    // Horizontal lines at y = 0, 50, 100
    expect(lines).toHaveLength(6);

    const vertical = lines.filter((l) => l.type === 'vertical');
    const horizontal = lines.filter((l) => l.type === 'horizontal');

    expect(vertical).toHaveLength(3);
    expect(horizontal).toHaveLength(3);

    expect(vertical[0].points).toEqual([0, 0, 0, 100]);
    expect(vertical[1].points).toEqual([50, 0, 50, 100]);
    expect(vertical[2].points).toEqual([100, 0, 100, 100]);

    expect(horizontal[0].points).toEqual([0, 0, 100, 0]);
    expect(horizontal[1].points).toEqual([0, 50, 100, 50]);
    expect(horizontal[2].points).toEqual([0, 100, 100, 100]);
  });

  it('uses default cellSize of 50 when omitted or invalid', () => {
    const lines = computeGridLines({ width: 100, height: 50 });
    // width 100: x = 0, 50, 100 (3 lines)
    // height 50: y = 0, 50 (2 lines)
    expect(lines).toHaveLength(5);
  });

  it('handles zero or negative dimensions safely', () => {
    expect(computeGridLines({ width: 0, height: 100 })).toEqual([]);
    expect(computeGridLines({ width: 100, height: -10 })).toEqual([]);
    expect(computeGridLines({ width: 0, height: 0 })).toEqual([]);
  });

  it('computes correct line count for non-exact multiple dimensions', () => {
    // width 120, height 80, cellSize 50
    // vertical at x = 0, 50, 100, 120 (4 lines)
    // horizontal at y = 0, 50, 80 (3 lines)
    const lines = computeGridLines({ width: 120, height: 80, cellSize: 50 });
    const vertical = lines.filter((l) => l.type === 'vertical');
    const horizontal = lines.filter((l) => l.type === 'horizontal');

    expect(vertical).toHaveLength(4);
    expect(horizontal).toHaveLength(3);
    expect(vertical[3].points).toEqual([120, 0, 120, 80]);
    expect(horizontal[2].points).toEqual([0, 80, 120, 80]);
  });
});
