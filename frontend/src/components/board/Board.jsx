import React from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import Grid from './Grid.jsx';
import Token from './Token.jsx';

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
 * Board component (#7, #8, #9).
 * Renders the Konva Stage and displays the active map image, grid overlay, and tokens.
 * Layer order:
 * 1. Map Layer (bottom)
 * 2. Grid Layer (overlay on top of map, below tokens)
 * 3. Tokens Layer (top, Issue #9)
 */
export default function Board({
  activeMapUrl,
  width = 800,
  height = 600,
  cellSize = 50,
  showGrid = true,
  tokens = [],
}) {
  const mapImage = useKonvaImage(activeMapUrl);

  if (!activeMapUrl) {
    return (
      <div className="board-empty" role="region" aria-label="Game Board Empty State">
        <p>No map active. Ask the DM to upload a map.</p>
      </div>
    );
  }

  return (
    <div className="board-container" role="region" aria-label="Game Board Canvas">
      <Stage width={width} height={height}>
        {/* Layer 1: Map Image */}
        <Layer>{mapImage && <KonvaImage image={mapImage} width={width} height={height} />}</Layer>

        {/* Layer 2: Grid Overlay (#8) */}
        {showGrid && <Grid width={width} height={height} cellSize={cellSize} />}

        {/* Layer 3: Tokens (Issue #9) */}
        <Layer>
          {tokens.map((token) => (
            <Token key={token.id} token={token} cellSize={cellSize} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
