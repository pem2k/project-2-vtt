import { useEffect, useRef, useState } from 'react';

export const STORAGE_KEY = 'open_vtt_dm_controls_layout';

const DEFAULT_LAYOUT = { x: 32, y: 80, width: 320, height: 340 };

export function getSavedLayout(storageKey = STORAGE_KEY, defaultLayout = DEFAULT_LAYOUT) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        x: typeof parsed.x === 'number' ? parsed.x : defaultLayout.x,
        y: typeof parsed.y === 'number' ? parsed.y : defaultLayout.y,
        width: typeof parsed.width === 'number' ? Math.max(280, parsed.width) : defaultLayout.width,
        height:
          typeof parsed.height === 'number' ? Math.max(310, parsed.height) : defaultLayout.height,
      };
    }
  } catch {
    // Ignore storage parse errors
  }
  return defaultLayout;
}

function saveLayout(storageKey, layout) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Hook to manage dragging, resizing, persistence, and event listeners for floating panels.
 */
export function useFloatingPanelLayout({
  storageKey = STORAGE_KEY,
  defaultLayout = DEFAULT_LAYOUT,
} = {}) {
  const panelRef = useRef(null);
  const [layout, setLayout] = useState(() => getSavedLayout(storageKey, defaultLayout));
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
  const layoutRef = useRef(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

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

      // Pure state updater
      setLayout((prev) => ({ ...prev, x: newX, y: newY }));

      // Persistence outside the state updater
      const nextLayout = { ...layoutRef.current, x: newX, y: newY };
      saveLayout(storageKey, nextLayout);
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
  }, [storageKey]);

  const handlePanelMouseUp = () => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const width = Math.max(280, Math.round(rect.width));
    const height = Math.max(310, Math.round(rect.height));

    // Pure state updater
    setLayout((prev) => ({ ...prev, width, height }));

    // Persistence outside the state updater
    const nextLayout = { ...layoutRef.current, width, height };
    saveLayout(storageKey, nextLayout);
  };

  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: layoutRef.current.x,
      startY: layoutRef.current.y,
    };
  };

  return {
    panelRef,
    layout,
    handleMouseDownHeader,
    handlePanelMouseUp,
  };
}
