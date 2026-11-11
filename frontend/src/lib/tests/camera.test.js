import { describe, expect, it } from 'vitest';
import {
  calculateZoom,
  calculatePan,
  isTokenTarget,
  DEFAULT_SCALE,
  DEFAULT_POSITION,
  MIN_SCALE,
  MAX_SCALE,
  SCALE_BY,
} from '../camera.js';

describe('camera module', () => {
  describe('constants', () => {
    it('defines reasonable named limits and defaults', () => {
      expect(DEFAULT_SCALE).toBe(1.0);
      expect(DEFAULT_POSITION).toEqual({ x: 0, y: 0 });
      expect(MIN_SCALE).toBeLessThan(1.0);
      expect(MAX_SCALE).toBeGreaterThan(1.0);
      expect(MIN_SCALE).toBeGreaterThan(0);
      expect(SCALE_BY).toBeGreaterThan(1.0);
    });
  });

  describe('calculateZoom', () => {
    it('zooms in when deltaY is negative, multiplying scale by factor', () => {
      const currentScale = 1.0;
      const currentPos = { x: 0, y: 0 };
      const pointer = { x: 400, y: 300 };

      const result = calculateZoom(currentScale, currentPos, pointer, -100);

      expect(result.scale).toBeCloseTo(1.0 * SCALE_BY, 5);
      // World point before zoom: (400 - 0)/1 = 400, (300 - 0)/1 = 300
      // Screen point after zoom: newPos + 400 * newScale should equal pointer.x
      const screenX = result.position.x + 400 * result.scale;
      const screenY = result.position.y + 300 * result.scale;
      expect(screenX).toBeCloseTo(pointer.x, 5);
      expect(screenY).toBeCloseTo(pointer.y, 5);
    });

    it('zooms out when deltaY is positive, dividing scale by factor', () => {
      const currentScale = 1.5;
      const currentPos = { x: -50, y: -30 };
      const pointer = { x: 250, y: 180 };

      const result = calculateZoom(currentScale, currentPos, pointer, 100);

      expect(result.scale).toBeCloseTo(1.5 / SCALE_BY, 5);
      // World point under cursor:
      const worldX = (pointer.x - currentPos.x) / currentScale;
      const worldY = (pointer.y - currentPos.y) / currentScale;

      const screenX = result.position.x + worldX * result.scale;
      const screenY = result.position.y + worldY * result.scale;
      expect(screenX).toBeCloseTo(pointer.x, 5);
      expect(screenY).toBeCloseTo(pointer.y, 5);
    });

    it('keeps cursor stationary at non-zero offset', () => {
      const currentScale = 1.2;
      const currentPos = { x: 120, y: -80 };
      const pointer = { x: 50, y: 500 };

      const worldX = (pointer.x - currentPos.x) / currentScale;
      const worldY = (pointer.y - currentPos.y) / currentScale;

      const result = calculateZoom(currentScale, currentPos, pointer, -120);

      const screenX = result.position.x + worldX * result.scale;
      const screenY = result.position.y + worldY * result.scale;
      expect(screenX).toBeCloseTo(pointer.x, 5);
      expect(screenY).toBeCloseTo(pointer.y, 5);
    });

    it('clamps zoom to MAX_SCALE and does not shift position when already at max', () => {
      const currentScale = MAX_SCALE;
      const currentPos = { x: -100, y: -200 };
      const pointer = { x: 300, y: 300 };

      const result = calculateZoom(currentScale, currentPos, pointer, -100);

      expect(result.scale).toBe(MAX_SCALE);
      expect(result.position).toEqual(currentPos);
    });

    it('clamps zoom to MIN_SCALE and does not shift position when already at min', () => {
      const currentScale = MIN_SCALE;
      const currentPos = { x: 50, y: 50 };
      const pointer = { x: 300, y: 300 };

      const result = calculateZoom(currentScale, currentPos, pointer, 100);

      expect(result.scale).toBe(MIN_SCALE);
      expect(result.position).toEqual(currentPos);
    });

    it('returns unchanged state if pointer position is invalid', () => {
      const currentPos = { x: 10, y: 20 };
      expect(calculateZoom(1.0, currentPos, null, -100)).toEqual({
        scale: 1.0,
        position: currentPos,
      });
      expect(calculateZoom(1.0, currentPos, { x: undefined, y: 0 }, -100)).toEqual({
        scale: 1.0,
        position: currentPos,
      });
    });

    it('returns unchanged camera state when deltaY is zero (e.g., horizontal-only scroll)', () => {
      const currentScale = 1.0;
      const currentPos = { x: 50, y: 50 };
      const pointer = { x: 400, y: 300 };

      const result = calculateZoom(currentScale, currentPos, pointer, 0);

      expect(result).toEqual({
        scale: currentScale,
        position: currentPos,
      });
    });
  });

  describe('calculatePan', () => {
    it('moves stage position by exact pointer delta', () => {
      const startPos = { x: 100, y: 50 };
      const startPointer = { x: 200, y: 200 };
      const currentPointer = { x: 250, y: 170 };

      const newPos = calculatePan(startPos, startPointer, currentPointer);

      // dx = 50, dy = -30
      expect(newPos).toEqual({ x: 150, y: 20 });
    });

    it('returns unchanged position if pointer did not move', () => {
      const startPos = { x: 40, y: -30 };
      const startPointer = { x: 100, y: 100 };

      expect(calculatePan(startPos, startPointer, { x: 100, y: 100 })).toEqual(startPos);
    });

    it('handles missing or invalid inputs gracefully', () => {
      expect(calculatePan(null, { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({ x: 0, y: 0 });
      expect(calculatePan({ x: 10, y: 10 }, null, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
    });
  });

  describe('isTokenTarget', () => {
    it('returns true when target has name "token"', () => {
      const target = {
        name: () => 'token',
        hasName: (name) => name === 'token',
      };
      expect(isTokenTarget(target)).toBe(true);
    });

    it('returns true when target has an ancestor named "token"', () => {
      const ancestor = {
        name: () => 'token',
        hasName: (name) => name === 'token',
        getParent: () => null,
      };
      const target = {
        name: () => 'token-circle',
        hasName: () => false,
        findAncestor: (selector) => (selector === '.token' ? ancestor : null),
        getParent: () => ancestor,
      };
      expect(isTokenTarget(target)).toBe(true);
    });

    it('returns false for background, stage, or map targets', () => {
      const stageTarget = {
        name: () => '',
        hasName: () => false,
        findAncestor: () => null,
        getParent: () => null,
      };
      expect(isTokenTarget(stageTarget)).toBe(false);
      expect(isTokenTarget(null)).toBe(false);
      expect(isTokenTarget(undefined)).toBe(false);
    });
  });
});
