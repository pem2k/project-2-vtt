import React, { useEffect, useRef } from 'react';
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
 * @param {boolean} [props.isPending] - Whether a save operation is in flight for this token
 */
export default function Token({
  token,
  cellSize = 50,
  currentUserId,
  isDm = false,
  isSocketReady = false,
  isPending = false,
  onMoveToken,
}) {
  const pixelX = (token.x ?? 0) * cellSize + cellSize * 0.5;
  const pixelY = (token.y ?? 0) * cellSize + cellSize * 0.5;
  const radius = cellSize * 0.4;
  const fontSize = Math.max(10, Math.round(cellSize * 0.24));
  const isAssigned = Boolean(token.assigned_to);

  const canDrag = Boolean(
    isSocketReady &&
    !isPending &&
    (isDm || (token.assigned_to && token.assigned_to === currentUserId)),
  );

  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const handleDragEnd = (e) => {
    const node = e.target;
    // Invert center formula: pixelX = (x + 0.5) * cellSize  =>  x = pixelX / cellSize - 0.5
    const newX = node.x() / cellSize - 0.5;
    const newY = node.y() / cellSize - 0.5;

    if (onMoveToken) {
      onMoveToken(token, newX, newY, (authoritativeToken) => {
        const latest = authoritativeToken || tokenRef.current || token;
        const targetX = (latest.x ?? 0) * cellSize + cellSize * 0.5;
        const targetY = (latest.y ?? 0) * cellSize + cellSize * 0.5;
        node.position({ x: targetX, y: targetY });
        node.getLayer()?.batchDraw();
      });
    }
  };

  return (
    <Group
      name="token"
      x={pixelX}
      y={pixelY}
      draggable={canDrag}
      onDragEnd={handleDragEnd}
      listening={true}
    >
      {/* Token Circle: dashed when unassigned, solid when assigned */}
      <Circle
        radius={radius}
        fill={token.color || '#E6194B'}
        stroke="#2b2321"
        strokeWidth={2}
        dash={isAssigned ? undefined : [4, 3]}
        listening={true}
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
        listening={true}
      />
    </Group>
  );
}
