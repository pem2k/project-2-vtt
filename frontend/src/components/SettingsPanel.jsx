import React, { useEffect, useRef, useState } from 'react';
import { useFloatingPanelLayout } from '../hooks/useFloatingPanelLayout.js';
import CharacterTab from './CharacterTab.jsx';
import MapsTab from './dm/MapsTab.jsx';
import TokensTab from './dm/TokensTab.jsx';

const DM_TABS = [
  { id: 'character', label: 'Character' },
  { id: 'users', label: 'Users' },
  { id: 'maps', label: 'Maps' },
  { id: 'tokens', label: 'Tokens' },
];

const PLAYER_TABS = [{ id: 'character', label: 'Character' }];

/**
 * SettingsPanel component (#55).
 * Floating, draggable, resizable panel shell with role-aware tabs.
 * Players: Character tab.
 * DMs: Character, Users, Maps, and Tokens tabs.
 * Preserves tab and panel draft state across visibility transitions.
 */
export default function SettingsPanel({
  isDM = false,
  isOpen = false,
  onClose,
  initialTab = 'character',
  // Character tab props
  character = null,
  characters = [],
  onCreateCharacter,
  onSelectCharacter,
  onUpdateCharacterHp,
  characterLoading = false,
  characterError = null,
  characterReady = true,
  // DM Map / Token / Grid props
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
  tokens = [],
  members = [],
  onAddToken,
  onRemoveToken,
  onAssignToken,
  onRefreshMembers,
}) {
  const availableTabs = isDM ? DM_TABS : PLAYER_TABS;
  const availableTabIds = availableTabs.map((tab) => tab.id);

  const [activeTab, setActiveTab] = useState(() => {
    return availableTabIds.includes(initialTab) ? initialTab : availableTabs[0].id;
  });

  // Ensure active tab belongs to allowed set after role changes
  if (!availableTabIds.includes(activeTab)) {
    setActiveTab(availableTabs[0].id);
  }

  const [visitedTabs, setVisitedTabs] = useState(() => {
    const validInitial = availableTabIds.includes(initialTab) ? initialTab : availableTabs[0].id;
    return isOpen ? new Set([validInitial]) : new Set();
  });

  const { panelRef, layout, handleMouseDownHeader, handlePanelMouseUp } = useFloatingPanelLayout();
  const tabButtonRefs = useRef([]);

  if (isOpen && availableTabIds.includes(activeTab) && !visitedTabs.has(activeTab)) {
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }

  const handleTabClick = (tabId) => {
    if (!availableTabIds.includes(tabId)) return;
    setActiveTab(tabId);
    setVisitedTabs((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  const handleClose = () => {
    onClose?.();
    const opener = document.getElementById('settings-toggle-button');
    if (opener) opener.focus();
  };

  // Keyboard accessibility: Escape to close and return focus to opener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        const opener = document.getElementById('settings-toggle-button');
        if (opener) opener.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Tablist keyboard navigation (ArrowLeft, ArrowRight, Home, End)
  const handleTabKeyDown = (e, index) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % availableTabs.length;
      const nextTab = availableTabs[nextIndex].id;
      handleTabClick(nextTab);
      tabButtonRefs.current[nextIndex]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + availableTabs.length) % availableTabs.length;
      const prevTab = availableTabs[prevIndex].id;
      handleTabClick(prevTab);
      tabButtonRefs.current[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      const firstTab = availableTabs[0].id;
      handleTabClick(firstTab);
      tabButtonRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const lastIndex = availableTabs.length - 1;
      const lastTab = availableTabs[lastIndex].id;
      handleTabClick(lastTab);
      tabButtonRefs.current[lastIndex]?.focus();
    }
  };

  const isTabVisited = (tabId) =>
    availableTabIds.includes(tabId) && (visitedTabs.has(tabId) || (isOpen && activeTab === tabId));

  return (
    <aside
      id="settings-panel"
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
      aria-label="Settings Panel"
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
          onClick={handleClose}
          aria-label="Close Settings"
        >
          ✕
        </button>
      </div>

      <nav className="dm-tabs" role="tablist" aria-label="Settings Tabs">
        {availableTabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabButtonRefs.current[index] = el;
            }}
            id={`settings-tab-${tab.id}`}
            type="button"
            className={`dm-tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, index)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="dm-panel-body">
        {isTabVisited('character') && (
          <div
            id="settings-panel-character"
            role="tabpanel"
            aria-labelledby="settings-tab-character"
            hidden={activeTab !== 'character'}
            style={{ display: activeTab === 'character' ? undefined : 'none' }}
          >
            <CharacterTab
              character={character}
              characters={characters}
              isDM={isDM}
              onCreate={onCreateCharacter}
              onSelect={onSelectCharacter}
              onUpdateHp={onUpdateCharacterHp}
              characterLoading={characterLoading}
              characterError={characterError}
              characterReady={characterReady}
              hidden={activeTab !== 'character'}
            />
          </div>
        )}

        {isDM && isTabVisited('users') && (
          <div
            id="settings-panel-users"
            role="tabpanel"
            aria-labelledby="settings-tab-users"
            className="dm-tab-content dm-users-tab"
            hidden={activeTab !== 'users'}
            style={{ display: activeTab === 'users' ? undefined : 'none' }}
          >
            <p className="tab-placeholder-text">Manage players & token assignments.</p>
          </div>
        )}

        {isDM && isTabVisited('maps') && (
          <div
            id="settings-panel-maps"
            role="tabpanel"
            aria-labelledby="settings-tab-maps"
            hidden={activeTab !== 'maps'}
            style={{ display: activeTab === 'maps' ? undefined : 'none' }}
          >
            <MapsTab
              supabase={supabase}
              roomId={roomId}
              activeMapId={activeMapId}
              onSelectActiveMap={onSelectActiveMap}
              showGrid={showGrid}
              onToggleGrid={onToggleGrid}
              gridCellSize={gridCellSize}
              onChangeGridCellSize={onChangeGridCellSize}
              onCommitGridCellSize={onCommitGridCellSize}
              gridDisabled={gridDisabled}
              isVisible={isOpen && activeTab === 'maps'}
              hidden={activeTab !== 'maps'}
            />
          </div>
        )}

        {isDM && isTabVisited('tokens') && (
          <div
            id="settings-panel-tokens"
            role="tabpanel"
            aria-labelledby="settings-tab-tokens"
            hidden={activeTab !== 'tokens'}
            style={{ display: activeTab === 'tokens' ? undefined : 'none' }}
          >
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
          </div>
        )}
      </div>
    </aside>
  );
}
