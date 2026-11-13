import React, { useEffect, useRef, useState } from 'react';
import { getRoomMaps, setActiveMap, uploadMap, validateMapFile } from '../../lib/maps.js';

/**
 * MapsTab component (#7, #8).
 * Manages map uploads, selection, map listing, and grid controls.
 */
export default function MapsTab({
  supabase,
  roomId,
  activeMapId,
  onSelectActiveMap,
  showGrid = true,
  onToggleGrid,
  gridCellSize = 50,
  onChangeGridCellSize,
  onCommitGridCellSize,
  gridDisabled = false,
  initialMaps = [],
  isVisible = true,
  hidden = false,
}) {
  const [mapsList, setMapsList] = useState(initialMaps);
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    if (isVisible && roomId && supabase) {
      const loadMaps = async () => {
        setLoadingMaps(true);
        try {
          const maps = await getRoomMaps(supabase, roomId);
          if (!ignore) {
            setMapsList(maps);
            setLoadingMaps(false);
          }
        } catch (err) {
          if (!ignore) {
            console.error('Failed to load room maps:', err);
            setLoadingMaps(false);
          }
        }
      };
      loadMaps();
    }
    return () => {
      ignore = true;
    };
  }, [isVisible, roomId, supabase]);

  const uploadSelectedFile = async (file) => {
    if (!file) return;

    const validationError = validateMapFile(file);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const defaultName = file.name.replace(/\.[^/.]+$/, '');
      const mapRecord = await uploadMap(supabase, {
        roomId,
        file,
        mapName: defaultName,
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setMapsList((prev) => [mapRecord, ...prev]);
      await handleSelectMap(mapRecord);
    } catch (err) {
      setError(err.message || 'Failed to upload map.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    uploadSelectedFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0] || null;
    uploadSelectedFile(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleSelectMap = async (map) => {
    setError(null);
    try {
      await setActiveMap(supabase, { roomId, mapId: map.id });
      if (onSelectActiveMap) {
        await onSelectActiveMap(map);
      }
    } catch {
      setError('Unable to activate map.');
    }
  };

  return (
    <div
      className="dm-tab-content dm-maps-tab"
      hidden={hidden}
      style={{ display: hidden ? 'none' : undefined }}
    >
      {/* Upload Area at Top of Tab */}
      <input
        ref={fileInputRef}
        id="map-file-input"
        type="file"
        accept="image/png, image/jpeg, image/webp"
        onChange={handleFileChange}
        disabled={uploading}
        className="visually-hidden"
      />

      <div
        className={`dm-drop-button ${isDragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!uploading && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-label="Click or drop your map image here to upload"
      >
        <span className="dm-drop-icon">{uploading ? '⏳' : '☁'}</span>
        <span className="dm-drop-text">{uploading ? 'Uploading map...' : 'Upload Map'}</span>
      </div>

      {error && (
        <p id="map-upload-error" className="error-message" role="alert">
          {error}
        </p>
      )}

      {/* Toggle Grid Overlay */}
      <button
        type="button"
        className={`dm-grid-toggle-btn ${showGrid ? 'active' : ''}`}
        onClick={onToggleGrid}
        disabled={gridDisabled}
        aria-pressed={showGrid}
      >
        <span className="dm-grid-toggle-icon">⊞</span>
        <span>{showGrid ? 'Hide Grid' : 'Show Grid'}</span>
      </button>

      {/* Grid Cell Size Slider */}
      <div className="dm-grid-slider-container">
        <label htmlFor="dm-grid-size-slider" className="dm-grid-slider-label">
          <span>Grid Size</span>
          <span className="dm-grid-slider-value">{gridCellSize}px</span>
        </label>
        <input
          id="dm-grid-size-slider"
          type="range"
          min="20"
          max="150"
          step="5"
          value={gridCellSize}
          onChange={(e) => {
            if (onChangeGridCellSize) {
              onChangeGridCellSize(Number(e.target.value));
            }
          }}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerUp={(event) => onCommitGridCellSize?.(Number(event.currentTarget.value))}
          onPointerCancel={(event) => onCommitGridCellSize?.(Number(event.currentTarget.value))}
          onKeyUp={(event) => onCommitGridCellSize?.(Number(event.currentTarget.value))}
          onBlur={(event) => onCommitGridCellSize?.(Number(event.currentTarget.value))}
          disabled={!showGrid || gridDisabled}
          className="dm-grid-slider"
          aria-label="Grid cell size in pixels"
        />
      </div>

      {/* Scrollable List of Uploaded Maps */}
      <div className="dm-maps-list-section">
        {loadingMaps ? (
          <p className="dm-maps-loading">Loading maps...</p>
        ) : mapsList.length === 0 ? (
          <p className="dm-maps-empty">No maps uploaded yet.</p>
        ) : (
          <ul className="dm-maps-list" role="list" aria-label="Uploaded maps">
            {mapsList.map((map) => {
              const isActive = map.id === activeMapId;
              return (
                <li
                  key={map.id}
                  className={`dm-map-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectMap(map)}
                >
                  <span className="dm-map-name">{map.name}</span>
                  {isActive && <span className="dm-map-active-badge">Active</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
