import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { getSavedLayout, useFloatingPanelLayout, STORAGE_KEY } from '../useFloatingPanelLayout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('getSavedLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default layout when localStorage is empty', () => {
    const layout = getSavedLayout();
    expect(layout).toEqual({ x: 32, y: 80, width: 320, height: 340 });
  });

  it('parses valid saved layout with minimum dimensions enforced', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: 100, y: 150, width: 200, height: 250 }));
    const layout = getSavedLayout();
    // width clamped to >= 280, height clamped to >= 310
    expect(layout).toEqual({ x: 100, y: 150, width: 280, height: 310 });
  });

  it('ignores invalid json in localStorage and returns fallback', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json');
    const layout = getSavedLayout();
    expect(layout).toEqual({ x: 32, y: 80, width: 320, height: 340 });
  });
});

describe('useFloatingPanelLayout hook', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    try {
      await act(async () => {
        root.unmount();
      });
    } catch {
      // Ignore if already unmounted in test
    }
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('provides panelRef, layout, and event handlers', async () => {
    let hookResult;
    function TestComponent() {
      hookResult = useFloatingPanelLayout();
      return (
        <aside ref={hookResult.panelRef} onMouseUp={hookResult.handlePanelMouseUp}>
          <div onMouseDown={hookResult.handleMouseDownHeader}>
            <span>Header</span>
            <button type="button">Close</button>
          </div>
        </aside>
      );
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    expect(hookResult.panelRef.current).not.toBeNull();
    expect(hookResult.layout).toEqual({ x: 32, y: 80, width: 320, height: 340 });
    expect(typeof hookResult.handleMouseDownHeader).toBe('function');
    expect(typeof hookResult.handlePanelMouseUp).toBe('function');
  });

  it('saves resized dimensions on handlePanelMouseUp without modifying updater purity', async () => {
    let hookResult;
    function TestComponent() {
      hookResult = useFloatingPanelLayout();
      return <aside ref={hookResult.panelRef} onMouseUp={hookResult.handlePanelMouseUp} />;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    // Mock getBoundingClientRect on panelRef element
    vi.spyOn(hookResult.panelRef.current, 'getBoundingClientRect').mockReturnValue({
      width: 450,
      height: 500,
      top: 80,
      left: 32,
      bottom: 580,
      right: 482,
    });

    await act(async () => {
      hookResult.handlePanelMouseUp();
    });

    expect(hookResult.layout.width).toBe(450);
    expect(hookResult.layout.height).toBe(500);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(saved.width).toBe(450);
    expect(saved.height).toBe(500);
  });

  it('cleans up window mousemove and mouseup listeners on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    function TestComponent() {
      useFloatingPanelLayout();
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

    await act(async () => {
      root.unmount();
    });

    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });
});
