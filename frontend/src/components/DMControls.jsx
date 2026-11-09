import React, { useState } from 'react';
import { useFloatingPanelLayout } from '../hooks/useFloatingPanelLayout.js';
import MapsTab from './dm/MapsTab.jsx';
import TokensTab from './dm/TokensTab.jsx';

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'stats', label: 'Stats' },
  { id: 'maps', label: 'Maps' },
  { id: 'tokens', label: 'Tokens' },
];

/**
 * DMControls component.
 * Floating, draggable, resizable panel shell with tabs.
 * Composes MapsTab, TokensTab, and user/stats tab placeholders.
 * Preserves tab and panel state across visibility transitions.
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
  initialTab = 'users',
  tokens = [],
  members = [],
  onAddToken,
  onRemoveToken,
  onAssignToken,
  onRefreshMembers,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [visitedTabs, setVisitedTabs] = useState(() =>
    isOpen ? new Set([initialTab]) : new Set(),
  );
  const { panelRef, layout, handleMouseDownHeader, handlePanelMouseUp } = useFloatingPanelLayout();

  if (isOpen && !visitedTabs.has(activeTab)) {
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    setVisitedTabs((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  const isTabVisited = (tabId) => visitedTabs.has(tabId) || (isOpen && activeTab === tabId);

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

      <nav className="dm-tabs" aria-label="DM Control Tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dm-tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="dm-panel-body">
        {isTabVisited('users') && (
          <div
            className="dm-tab-content dm-users-tab"
            hidden={activeTab !== 'users'}
            style={{ display: activeTab === 'users' ? undefined : 'none' }}
          >
            <p className="tab-placeholder-text">Manage players & token assignments.</p>
          </div>
        )}

        {isTabVisited('stats') && (
          <div
            className="dm-tab-content dm-stats-tab"
            hidden={activeTab !== 'stats'}
            style={{ display: activeTab === 'stats' ? undefined : 'none' }}
          >
            <p className="tab-placeholder-text">Character sheets, HP & NPC stats.</p>
          </div>
        )}

        {isTabVisited('maps') && (
          <MapsTab
            supabase={supabase}
            roomId={roomId}
            activeMapId={activeMapId}
            onMapUploaded={onMapUploaded}
            onSelectActiveMap={onSelectActiveMap}
            showGrid={showGrid}
            onToggleGrid={onToggleGrid}
            gridCellSize={gridCellSize}
            onChangeGridCellSize={onChangeGridCellSize}
            isVisible={isOpen && activeTab === 'maps'}
            hidden={activeTab !== 'maps'}
          />
        )}

        {isTabVisited('tokens') && (
          <TokensTab
            tokens={tokens}
            members={members}
            onAddToken={onAddToken}
            onRemoveToken={onRemoveToken}
            onAssignToken={onAssignToken}
            onRefreshMembers={onRefreshMembers}
            isVisible={isOpen && activeTab === 'tokens'}
            hidden={activeTab !== 'tokens'}
          />
        )}
      </div>
    </aside>
  );
}
