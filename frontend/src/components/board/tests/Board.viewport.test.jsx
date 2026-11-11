import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardHarness } from './helpers/boardHarness.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-konva', async () => {
  const { boardKonvaMock } = await import('./helpers/boardKonvaMock.jsx');
  return boardKonvaMock;
});

describe('Board component - viewport resizing, blank space, and observer lifecycle', () => {
  let harness;

  beforeEach(() => {
    harness = createBoardHarness();
  });

  afterEach(async () => {
    if (harness) {
      await harness.cleanup();
      harness = null;
    }
  });

  it('measures container with ResizeObserver and enlarges Stage without stretching the map', async () => {
    await harness.render();

    // Trigger image load deterministically without timeouts
    await harness.triggerImageLoad();

    const stageEl = harness.stageElement;
    const imageEl = harness.imageElement;
    expect(Number(stageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(600);
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);

    // Simulate container resize via ResizeObserver:
    await harness.triggerResize(1200, 900);

    // Stage updates to measured container size (1200x900)
    expect(Number(stageEl.getAttribute('data-width'))).toBe(1200);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(900);

    // Logical map dimensions stay stable at 800x600 (not stretched!)
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);
  });

  it('allows panning and zooming from blank space outside the map area', async () => {
    await harness.render();

    // Enlarge Stage to 1200x900 so there is blank space around 800x600 map
    await harness.triggerResize(1200, 900);

    // 1. Pan gesture from blank space at (1000, 750) outside map:
    await act(async () => {
      harness.stageProps.onMouseDown({
        evt: { button: 0, clientX: 1000, clientY: 750 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    await act(async () => {
      harness.stageProps.onMouseMove({
        evt: { clientX: 1050, clientY: 780 },
      });
    });

    const stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-x'))).toBe(50);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(30);

    await act(async () => {
      harness.stageProps.onMouseUp();
    });

    // 2. Wheel zoom over blank space at (1000, 750):
    harness.stage.getPointerPosition = () => ({ x: 1000, y: 750 });
    await act(async () => {
      harness.stageProps.onWheel({
        evt: { deltaY: -100, preventDefault: vi.fn(), clientX: 1000, clientY: 750 },
        target: { getStage: () => harness.stage },
      });
    });

    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(1.1, 4);
  });

  it('preserves token alignment to map grid when viewport resizes', async () => {
    const tokens = [{ id: 't1', name: 'Aria', x: 2, y: 3 }];

    await harness.render({ tokens });

    const tokenEl = harness.container.querySelector('[data-testid="token-group"]');
    // Initial pixel coords on map: (2 + 0.5) * 50 = 125, (3 + 0.5) * 50 = 175
    expect(Number(tokenEl.getAttribute('data-x'))).toBe(125);
    expect(Number(tokenEl.getAttribute('data-y'))).toBe(175);

    // Resize viewport to 1400x1000
    await harness.triggerResize(1400, 1000);

    // Token coordinates remain exactly at (125, 175) on the map coordinate system
    expect(Number(tokenEl.getAttribute('data-x'))).toBe(125);
    expect(Number(tokenEl.getAttribute('data-y'))).toBe(175);
  });

  it('attaches ResizeObserver on initial empty mount and updates Stage when first map appears', async () => {
    // 1. Mount Board with no active map initially
    await harness.render({ activeMapUrl: null });

    const boardContainer = harness.boardContainer;
    expect(boardContainer).not.toBeNull();
    const observer = harness.latestObserver;
    expect(observer).not.toBeNull();
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledWith(boardContainer);
    expect(harness.container.querySelector('.board-empty')).not.toBeNull();
    expect(harness.stageElement).toBeNull();
    expect(observer.disconnect).not.toHaveBeenCalled();

    // 2. Supply the first active map
    await harness.render({ activeMapUrl: 'https://example.com/first-map.png' });
    await harness.triggerImageLoad();

    const stageEl = harness.stageElement;
    const imageEl = harness.imageElement;
    expect(stageEl).not.toBeNull();
    expect(imageEl).not.toBeNull();
    expect(Number(stageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(600);
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);

    // 3. Resize the container via the observer callback
    await harness.triggerResize(1400, 950);

    // Stage dimensions update to container size while logical map dimensions stay unchanged
    expect(Number(stageEl.getAttribute('data-width'))).toBe(1400);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(950);
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);

    // 4. Verify observer cleanup on unmount
    await act(async () => {
      harness.root.unmount();
    });
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
