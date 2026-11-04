import React from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';

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
 * Board component (#7).
 * Renders the Konva Stage and displays the active map image.
 */
export default function Board({ activeMapUrl, width = 800, height = 600 }) {
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
        <Layer>{mapImage && <KonvaImage image={mapImage} width={width} height={height} />}</Layer>
      </Stage>
    </div>
  );
}
