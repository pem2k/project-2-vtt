export const DEFAULT_CELL_SIZE = 50;

/**
 * Computes grid line coordinates for a canvas area of (width x height).
 * Returns array of line definitions with 4-tuple points [x1, y1, x2, y2].
 *
 * @param {object} options
 * @param {number} options.width - Width of the grid area
 * @param {number} options.height - Height of the grid area
 * @param {number} [options.cellSize=50] - Size of each square grid cell in pixels
 * @returns {Array<{ id: string, type: 'vertical'|'horizontal', points: [number, number, number, number] }>}
 */
export function computeGridLines({ width, height, cellSize = DEFAULT_CELL_SIZE }) {
  if (!width || !height || width <= 0 || height <= 0) {
    return [];
  }

  const step = typeof cellSize === 'number' && cellSize > 0 ? cellSize : DEFAULT_CELL_SIZE;
  const lines = [];

  // Vertical lines from left to right spanning (x, 0) -> (x, height)
  for (let x = 0; x <= width; x += step) {
    lines.push({
      id: `v-${x}`,
      type: 'vertical',
      points: [x, 0, x, height],
    });
  }

  // If width is not an exact multiple of step, add the final right edge line
  if (width % step !== 0) {
    lines.push({
      id: `v-${width}`,
      type: 'vertical',
      points: [width, 0, width, height],
    });
  }

  // Horizontal lines from top to bottom spanning (0, y) -> (width, y)
  for (let y = 0; y <= height; y += step) {
    lines.push({
      id: `h-${y}`,
      type: 'horizontal',
      points: [0, y, width, y],
    });
  }

  // If height is not an exact multiple of step, add the final bottom edge line
  if (height % step !== 0) {
    lines.push({
      id: `h-${height}`,
      type: 'horizontal',
      points: [0, height, width, height],
    });
  }

  return lines;
}
