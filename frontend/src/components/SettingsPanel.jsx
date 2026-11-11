import React from 'react';
import { useFloatingPanelLayout } from '../hooks/useFloatingPanelLayout.js';

const SETTINGS_STORAGE_KEY = 'open_vtt_settings_layout';
const SETTINGS_DEFAULT_LAYOUT = { x: 380, y: 100, width: 320, height: 420 };

/**
 * SettingsPanel component.
 * Floating, draggable panel shell. Stays mounted while closed so form state
 * in `children` survives close and reopen.
 */
export default function SettingsPanel({ isOpen, onClose, children }) {
  const { panelRef, layout, handleMouseDownHeader, handlePanelMouseUp } = useFloatingPanelLayout({
    storageKey: SETTINGS_STORAGE_KEY,
    defaultLayout: SETTINGS_DEFAULT_LAYOUT,
  });

  return (
    <aside
      ref={panelRef}
      className="dm-floating-panel"
      onMouseUp={handlePanelMouseUp}
      hidden={!isOpen}
      style={{
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        display: isOpen ? undefined : 'none',
      }}
      aria-label="Settings"
    >
      <div
        className="dm-panel-header"
        onMouseDown={handleMouseDownHeader}
        title="Click and drag to move panel"
      >
        <span className="dm-drag-handle">⋮⋮</span>
        <h2>Settings</h2>
        <button
          type="button"
          className="dm-panel-close"
          onClick={onClose}
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      <nav className="dm-tabs" aria-label="Settings tabs">
        <button type="button" className="dm-tab-button active" role="tab" aria-selected="true">
          Character
        </button>
      </nav>

      <div className="dm-panel-body">{children}</div>
    </aside>
  );
}
