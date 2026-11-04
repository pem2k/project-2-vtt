import React, { useMemo } from 'react';
import { Layer, Line } from 'react-konva';
import { computeGridLines, DEFAULT_CELL_SIZE } from '../../lib/grid.js';

/**
 * Grid component (#8).
 * Renders a square grid overlay onto a Konva Layer.
 * Positioned on top of the map layer but below tokens.
 *
 * @param {object} props
 * @param {number} props.width - Width of the map / grid area
 * @param {number} props.height - Height of the map / grid area
 * @param {number} [props.cellSize=50] - Size of each grid square in pixels
 * @param {string} [props.stroke='#000000'] - Grid line stroke color
 * @param {number} [props.strokeWidth=2.5] - Grid line stroke width
 * @param {number} [props.opacity=0.35] - Grid line opacity (semi-transparent)
 */
export default function Grid({
  width,
  height,
  cellSize = DEFAULT_CELL_SIZE,
  stroke = '#000000',
  strokeWidth = 2.5,
  opacity = 0.35,
}) {
  const lines = useMemo(
    () => computeGridLines({ width, height, cellSize }),
    [width, height, cellSize],
  );

  if (!lines || lines.length === 0) {
    return null;
  }

  return (
    <Layer listening={false}>
      {lines.map((line) => (
        <Line
          key={line.id}
          points={line.points}
          stroke={stroke}
          strokeWidth={strokeWidth}
          opacity={opacity}
          listening={false}
        />
      ))}
    </Layer>
  );
}
