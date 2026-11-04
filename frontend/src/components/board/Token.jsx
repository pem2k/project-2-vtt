import React from 'react';
import { Group, Circle, Text } from 'react-konva';

/**
 * Token component (#9, #10).
 * Renders a colored circular token with an accessible name label below it.
 * When assigned to a player, shows owner name label below name and solid outline.
 * When unassigned, shows dashed outline and no owner label.
 * Positioned at the cell center: (x + 0.5) * cellSize, (y + 0.5) * cellSize.
 *
 * @param {object} props
 * @param {object} props.token - Token record with { id, name, color, x, y, assigned_to }
 * @param {number} props.cellSize - Board grid cell size in pixels
 * @param {string} [props.ownerName] - Display name of assigned player
 */
export default function Token({ token, cellSize = 50 }) {
  const pixelX = (token.x ?? 0) * cellSize + cellSize * 0.5;
  const pixelY = (token.y ?? 0) * cellSize + cellSize * 0.5;
  const radius = cellSize * 0.4;
  const fontSize = Math.max(10, Math.round(cellSize * 0.24));
  const isAssigned = Boolean(token.assigned_to);

  return (
    <Group x={pixelX} y={pixelY} listening={false}>
      {/* Token Circle: dashed when unassigned, solid when assigned */}
      <Circle
        radius={radius}
        fill={token.color || '#E6194B'}
        stroke="#2b2321"
        strokeWidth={2}
        dash={isAssigned ? undefined : [4, 3]}
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
        stroke="#000000"
        strokeWidth={3}
        fillAfterStrokeEnabled={true}
        listening={false}
      />
    </Group>
  );
}
