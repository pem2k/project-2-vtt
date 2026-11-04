import React, { useState, useRef, useEffect } from 'react';
import { uploadMap, validateMapFile, getRoomMaps, setActiveMap } from '../lib/maps.js';

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'stats', label: 'Stats' },
  { id: 'maps', label: 'Maps' },
];

const STORAGE_KEY = 'open_vtt_dm_controls_layout';

function getSavedLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        x: typeof parsed.x === 'number' ? parsed.x : 32,
        y: typeof parsed.y === 'number' ? parsed.y : 80,
        width: typeof parsed.width === 'number' ? parsed.width : 320,
        height: typeof parsed.height === 'number' ? parsed.height : 260,
      };
    }
  } catch {
    // Ignore storage parse errors
  }
  return { x: 32, y: 80, width: 320, height: 260 };
}

/**
 * DMControls component (#7).
 * Floating, draggable, resizable panel with tabs.
 * Maps tab displays upload target at the top and a scrollable list of uploaded maps below.
 */
export default function DMControls({
  supabase,
  roomId,
  activeMapId,
  onMapUploaded,
  onSelectActiveMap,
  isOpen,
  onClose,
  showGrid = true,
  onToggleGrid,
  gridCellSize = 50,
  onChangeGridCellSize,
}) {
  const [activeTab, setActiveTab] = useState('users');
  const [mapsList, setMapsList] = useState([]);
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const panelRef = useRef(null);

  // Position and dimension state initialized from localStorage
  const [layout, setLayout] = useState(getSavedLayout);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });

  useEffect(() => {
    let ignore = false;
    if (isOpen && activeTab === 'maps' && roomId && supabase) {
      Promise.resolve().then(() => {
        if (!ignore) {
          setLoadingMaps(true);
        }
      });
      getRoomMaps(supabase, roomId)
        .then((maps) => {
          if (!ignore) {
            setMapsList(maps);
            setLoadingMaps(false);
          }
        })
        .catch((err) => {
          if (!ignore) {
            console.error('Failed to load room maps:', err);
            setLoadingMaps(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, activeTab, roomId, supabase]);

  // Handle Dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(
        10,
        Math.min(window.innerWidth - 100, dragStartRef.current.startX + dx),
      );
      const newY = Math.max(
        40,
        Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy),
      );

      setLayout((prev) => {
        const next = { ...prev, x: newX, y: newY };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handlePanelMouseUp = () => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    setLayout((prev) => {
      const next = { ...prev, width, height };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  if (!isOpen) return null;

  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: layout.x,
      startY: layout.y,
    };
  };

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
      // Prepend newly uploaded map to list
      setMapsList((prev) => [mapRecord, ...prev]);
      if (onMapUploaded) {
        onMapUploaded(mapRecord);
      }
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
    try {
      await setActiveMap(supabase, { roomId, mapId: map.id });
      if (onSelectActiveMap) {
        onSelectActiveMap(map);
      }
    } catch (err) {
      console.error('Failed to set active map:', err);
    }
  };

  return (
    <aside
      ref={panelRef}
      className="dm-floating-panel"
      onMouseUp={handlePanelMouseUp}
      style={{
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
      }}
      aria-label="DM Controls Panel"
    >
      <div
        className="dm-panel-header"
        onMouseDown={handleMouseDownHeader}
        title="Click and drag to move panel"
      >
        <span className="dm-drag-handle">⋮⋮</span>
        <h2>DM Controls</h2>
        <button
          type="button"
          className="dm-panel-close"
          onClick={onClose}
          aria-label="Close DM Controls"
        >
          ✕
        </button>
      </div>

      {/* Tabs navigation: Users, Stats, Maps */}
      <nav className="dm-tabs" aria-label="DM Control Tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dm-tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="dm-panel-body">
        {activeTab === 'users' && (
          <div className="dm-tab-content dm-users-tab">
            <p className="tab-placeholder-text">Manage players & token assignments.</p>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="dm-tab-content dm-stats-tab">
            <p className="tab-placeholder-text">Character sheets, HP & NPC stats.</p>
          </div>
        )}

        {activeTab === 'maps' && (
          <div className="dm-tab-content dm-maps-tab">
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
                onChange={(e) =>
                  onChangeGridCellSize && onChangeGridCellSize(Number(e.target.value))
                }
                disabled={!showGrid}
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
        )}
      </div>
    </aside>
  );
}
