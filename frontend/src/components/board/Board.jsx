import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import Grid from './Grid.jsx';
import Token from './Token.jsx';
import {
  calculateZoom,
  calculatePan,
  isTokenTarget,
  DEFAULT_SCALE,
  DEFAULT_POSITION,
} from '../../lib/camera.js';

/**
 * Custom hook to load an image from a URL for Konva.
 */
function useKonvaImage(url) {
  const [image, setImage] = React.useState(null);

  React.useEffect(() => {
    let active = true;

    if (!url) {
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;

    const handleLoad = () => {
      if (active) {
        setImage(img);
      }
    };

    img.addEventListener('load', handleLoad);
    return () => {
      active = false;
      img.removeEventListener('load', handleLoad);
    };
  }, [url]);

  return url ? image : null;
}

/**
 * Board component (#7, #8, #9, #10, #17).
 * Renders the Konva Stage and displays the active map image, grid overlay, and tokens.
 * Supports independent cursor-centered wheel zooming and empty-space panning (#17).
 *
 * Layer order:
 * 1. Map Layer (bottom)
 * 2. Grid Layer (overlay on top of map, below tokens)
 * 3. Tokens Layer (top, Issue #9, #10)
 */
export default function Board({
  activeMapUrl,
  width = 800,
  height = 600,
  mapWidth,
  mapHeight,
  cellSize = 50,
  showGrid = true,
  tokens = [],
  currentUserId,
  isDm = false,
  isSocketReady = false,
  pendingTokenIds,
  onMoveToken,
}) {
  const logicalMapWidth = mapWidth ?? width ?? 800;
  const logicalMapHeight = mapHeight ?? height ?? 600;

  const mapImage = useKonvaImage(activeMapUrl);
  const stageRef = useRef(null);
  const containerRef = useRef(null);

  // Viewport dimensions measured from container via ResizeObserver (#17)
  const [viewportSize, setViewportSize] = useState({
    width: width || 800,
    height: height || 600,
  });

  // Independent local camera state (#17) - never persisted or broadcast
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [isPanning, setIsPanning] = useState(false);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({
    pointer: { x: 0, y: 0 },
    stage: { x: 0, y: 0 },
  });

  // Observe container size to dynamically adapt Konva Stage dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      setViewportSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    }

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const measuredWidth = entry.contentRect?.width || entry.target?.clientWidth;
        const measuredHeight = entry.contentRect?.height || entry.target?.clientHeight;
        if (measuredWidth > 0 && measuredHeight > 0) {
          setViewportSize({
            width: Math.round(measuredWidth),
            height: Math.round(measuredHeight),
          });
        }
      }
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  // End panning on window mouseup in case pointer is released outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  const handleWheel = (e) => {
    if (e.evt) {
      e.evt.preventDefault();
    }
    const stage = stageRef.current || (e.target?.getStage ? e.target.getStage() : null);
    const pointer = stage?.getPointerPosition?.() || {
      x: e.evt?.clientX ?? viewportSize.width / 2,
      y: e.evt?.clientY ?? viewportSize.height / 2,
    };
    const deltaY = e.evt?.deltaY ?? (e.deltaY || 0);
    if (!deltaY || deltaY === 0) {
      return;
    }

    const result = calculateZoom(scale, position, pointer, deltaY);
    setScale(result.scale);
    setPosition(result.position);

    if (isPanningRef.current) {
      panStartRef.current = {
        pointer: {
          x: e.evt?.clientX ?? e.clientX ?? pointer.x,
          y: e.evt?.clientY ?? e.clientY ?? pointer.y,
        },
        stage: { ...result.position },
      };
    }
  };

  const handleMouseDown = (e) => {
    // Primary button only (button === 0)
    if (e.evt && e.evt.button !== 0) {
      return;
    }

    // Do not initiate stage panning if gesture begins on a token (#17)
    if (isTokenTarget(e.target)) {
      return;
    }

    isPanningRef.current = true;
    setIsPanning(true);
    panStartRef.current = {
      pointer: { x: e.evt?.clientX ?? 0, y: e.evt?.clientY ?? 0 },
      stage: { x: position.x, y: position.y },
    };
  };

  const handleMouseMove = (e) => {
    if (!isPanningRef.current) {
      return;
    }
    const currentPointer = {
      x: e.evt?.clientX ?? 0,
      y: e.evt?.clientY ?? 0,
    };
    const newPos = calculatePan(
      panStartRef.current.stage,
      panStartRef.current.pointer,
      currentPointer,
    );
    setPosition(newPos);
  };

  const handleMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="board-container"
      role={activeMapUrl ? 'region' : undefined}
      aria-label={activeMapUrl ? 'Game Board Canvas' : undefined}
      style={activeMapUrl ? { cursor: isPanning ? 'grabbing' : 'grab' } : undefined}
    >
      {!activeMapUrl ? (
        <div className="board-empty" role="region" aria-label="Game Board Empty State">
          <p>No map active. Ask the DM to upload a map.</p>
        </div>
      ) : (
        <Stage
          ref={stageRef}
          width={viewportSize.width}
          height={viewportSize.height}
          x={position.x}
          y={position.y}
          scaleX={scale}
          scaleY={scale}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Layer 1: Map Image */}
          <Layer>
            {mapImage && (
              <KonvaImage image={mapImage} width={logicalMapWidth} height={logicalMapHeight} />
            )}
          </Layer>

          {/* Layer 2: Grid Overlay (#8) */}
          {showGrid && (
            <Grid width={logicalMapWidth} height={logicalMapHeight} cellSize={cellSize} />
          )}

          {/* Layer 3: Tokens (Issue #9, #10) */}
          <Layer>
            {tokens.map((token) => (
              <Token
                key={token.id}
                token={token}
                cellSize={cellSize}
                currentUserId={currentUserId}
                isDm={isDm}
                isSocketReady={isSocketReady}
                isPending={pendingTokenIds?.has(token.id) ?? false}
                onMoveToken={onMoveToken}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
