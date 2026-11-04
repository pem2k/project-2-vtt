import React from 'react';
import { Group, Circle, Text } from 'react-konva';

/**
 * Token component (#9).
 * Renders a colored circular token with an accessible name label below it.
 * Positioned at the cell center: (x + 0.5) * cellSize, (y + 0.5) * cellSize.
 *
 * @param {object} props
 * @param {object} props.token - Token record with { id, name, color, x, y }
 * @param {number} props.cellSize - Board grid cell size in pixels
 */
export default function Token({ token, cellSize = 50 }) {
  const pixelX = (token.x ?? 0) * cellSize + cellSize * 0.5;
  const pixelY = (token.y ?? 0) * cellSize + cellSize * 0.5;
  const radius = cellSize * 0.4;
  const fontSize = Math.max(10, Math.round(cellSize * 0.24));

  return (
    <Group x={pixelX} y={pixelY} listening={false}>
      {/* Token Circle */}
      <Circle
        radius={radius}
        fill={token.color || '#E6194B'}
        stroke="#2b2321"
        strokeWidth={2}
        listening={false}
      />
      {/* Token Name Label - Readable on light or dark maps via stroke outline */}
      <Text
        text={token.name}
        x={-cellSize * 0.9}
        y={radius + 3}
        width={cellSize * 1.8}
        align="center"
        fontSize={fontSize}
        fontFamily="Vollkorn, serif"
        fontStyle="bold"
        fill="#ffffff"
        stroke="#2b2321"
        strokeWidth={3}
        fillAfterStroke={true}
        listening={false}
      />
    </Group>
  );
}
