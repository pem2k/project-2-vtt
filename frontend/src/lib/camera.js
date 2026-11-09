/**
 * Camera math and hit-testing helpers for map panning and zooming (#17).
 */

export const DEFAULT_SCALE = 1.0;
export const DEFAULT_POSITION = Object.freeze({ x: 0, y: 0 });
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3.0;
export const SCALE_BY = 1.1;

/**
 * Calculates new camera scale and position for cursor-centered wheel zooming.
 * Keeps the world coordinate under the cursor stationary.
 *
 * @param {number} currentScale
 * @param {{ x: number, y: number }} currentPosition
 * @param {{ x: number, y: number }} pointerPosition - Pointer in stage viewport coordinates
 * @param {number} deltaY - Wheel event vertical delta (<0 = zoom in, >0 = zoom out)
 * @param {object} [options]
 * @param {number} [options.minScale=MIN_SCALE]
 * @param {number} [options.maxScale=MAX_SCALE]
 * @param {number} [options.scaleBy=SCALE_BY]
 * @returns {{ scale: number, position: { x: number, y: number } }}
 */
export function calculateZoom(
  currentScale,
  currentPosition,
  pointerPosition,
  deltaY,
  { minScale = MIN_SCALE, maxScale = MAX_SCALE, scaleBy = SCALE_BY } = {},
) {
  if (
    !deltaY ||
    deltaY === 0 ||
    !pointerPosition ||
    typeof pointerPosition.x !== 'number' ||
    typeof pointerPosition.y !== 'number' ||
    !currentPosition ||
    typeof currentPosition.x !== 'number' ||
    typeof currentPosition.y !== 'number'
  ) {
    return {
      scale: currentScale,
      position: currentPosition || DEFAULT_POSITION,
    };
  }

  const direction = deltaY < 0 ? 1 : -1;
  const factor = direction > 0 ? scaleBy : 1 / scaleBy;
  const targetScale = currentScale * factor;
  const newScale = Math.min(maxScale, Math.max(minScale, targetScale));

  if (newScale === currentScale) {
    return {
      scale: currentScale,
      position: currentPosition,
    };
  }

  // World point beneath cursor before zooming:
  const worldPoint = {
    x: (pointerPosition.x - currentPosition.x) / currentScale,
    y: (pointerPosition.y - currentPosition.y) / currentScale,
  };

  // New position to keep the world point stationary beneath cursor:
  const newPosition = {
    x: pointerPosition.x - worldPoint.x * newScale,
    y: pointerPosition.y - worldPoint.y * newScale,
  };

  return {
    scale: newScale,
    position: newPosition,
  };
}

/**
 * Calculates updated camera position when panning.
 *
 * @param {{ x: number, y: number }} startPosition - Stage position at start of pan
 * @param {{ x: number, y: number }} startPointer - Pointer position at start of pan
 * @param {{ x: number, y: number }} currentPointer - Current pointer position
 * @returns {{ x: number, y: number }}
 */
export function calculatePan(startPosition, startPointer, currentPointer) {
  if (
    !startPosition ||
    typeof startPosition.x !== 'number' ||
    typeof startPosition.y !== 'number'
  ) {
    return DEFAULT_POSITION;
  }
  if (!startPointer || !currentPointer) {
    return startPosition;
  }
  return {
    x: startPosition.x + (currentPointer.x - startPointer.x),
    y: startPosition.y + (currentPointer.y - startPointer.y),
  };
}

/**
 * Checks whether an event target is a token or a child shape inside a token.
 *
 * @param {object|null} target - Konva node or mock event target
 * @returns {boolean}
 */
export function isTokenTarget(target) {
  if (!target) return false;

  if (typeof target.hasName === 'function' && target.hasName('token')) {
    return true;
  }
  if (typeof target.findAncestor === 'function' && target.findAncestor('.token')) {
    return true;
  }

  let curr = target;
  while (curr) {
    if (curr.attrs?.name === 'token') return true;
    if (typeof curr.name === 'function' && curr.name() === 'token') return true;
    curr = typeof curr.getParent === 'function' ? curr.getParent() : curr.parent;
  }

  return false;
}
