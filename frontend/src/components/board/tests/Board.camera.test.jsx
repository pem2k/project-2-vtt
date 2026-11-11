import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Board from '../Board.jsx';
import { MIN_SCALE, MAX_SCALE } from '../../../lib/camera.js';
import { createBoardHarness } from './helpers/boardHarness.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-konva', async () => {
  const { boardKonvaMock } = await import('./helpers/boardKonvaMock.jsx');
  return boardKonvaMock;
});

describe('Board component - camera zoom and pan', () => {
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

  it('initializes with scale = 1.0 and position = (0, 0)', async () => {
    await harness.render();

    const stageEl = harness.stageElement;
    expect(stageEl.getAttribute('data-scalex')).toBe('1');
    expect(stageEl.getAttribute('data-scaley')).toBe('1');
    expect(stageEl.getAttribute('data-x')).toBe('0');
    expect(stageEl.getAttribute('data-y')).toBe('0');
  });

  it('zooms in centered on pointer position on wheel event', async () => {
    await harness.render();

    harness.stage.getPointerPosition = () => ({ x: 400, y: 300 });

    const preventDefaultSpy = vi.fn();
    await act(async () => {
      harness.stageProps.onWheel({
        evt: { deltaY: -100, preventDefault: preventDefaultSpy },
        target: { getStage: () => harness.stage },
      });
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
    const stageEl = harness.stageElement;
    const scale = Number(stageEl.getAttribute('data-scalex'));
    expect(scale).toBeCloseTo(1.1, 4);

    // World point beneath cursor before zoom was (400, 300)
    // New pos: 400 - 400 * 1.1 = -40, 300 - 300 * 1.1 = -30
    const x = Number(stageEl.getAttribute('data-x'));
    const y = Number(stageEl.getAttribute('data-y'));
    expect(x).toBeCloseTo(-40, 4);
    expect(y).toBeCloseTo(-30, 4);
  });

  it('clamps zoom to MIN_SCALE and MAX_SCALE limits', async () => {
    await harness.render();

    harness.stage.getPointerPosition = () => ({ x: 400, y: 300 });

    // Repeated zoom in:
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        harness.stageProps.onWheel({
          evt: { deltaY: -100, preventDefault: vi.fn() },
          target: { getStage: () => harness.stage },
        });
      });
    }

    let stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(MAX_SCALE, 4);

    // Repeated zoom out:
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        harness.stageProps.onWheel({
          evt: { deltaY: 100, preventDefault: vi.fn() },
          target: { getStage: () => harness.stage },
        });
      });
    }

    stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(MIN_SCALE, 4);
  });

  it('pans stage on primary-button mouse drag on empty board space', async () => {
    await harness.render();

    const boardContainer = harness.boardContainer;
    expect(boardContainer.style.cursor).toBe('grab');

    // Mousedown on empty background
    await act(async () => {
      harness.stageProps.onMouseDown({
        evt: { button: 0, clientX: 100, clientY: 100 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    expect(boardContainer.style.cursor).toBe('grabbing');

    // Mousemove drag
    await act(async () => {
      harness.stageProps.onMouseMove({
        evt: { clientX: 160, clientY: 140 },
      });
    });

    const stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-x'))).toBe(60);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(40);

    // Mouseup ends panning
    await act(async () => {
      harness.stageProps.onMouseUp();
    });

    expect(boardContainer.style.cursor).toBe('grab');
  });

  it('does NOT pan when dragging begins on a token', async () => {
    await harness.render({
      tokens: [{ id: 't1', name: 'Aria', x: 1, y: 1 }],
    });

    // Mousedown on token
    await act(async () => {
      harness.stageProps.onMouseDown({
        evt: { button: 0, clientX: 100, clientY: 100 },
        target: { name: () => 'token', hasName: (n) => n === 'token', findAncestor: () => null },
      });
    });

    // Mousemove drag
    await act(async () => {
      harness.stageProps.onMouseMove({
        evt: { clientX: 200, clientY: 200 },
      });
    });

    // Position remains untouched at 0, 0
    const stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-x'))).toBe(0);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(0);
  });

  it('does NOT pan when dragging with a non-primary mouse button', async () => {
    await harness.render();

    // Right click (button === 2)
    await act(async () => {
      harness.stageProps.onMouseDown({
        evt: { button: 2, clientX: 100, clientY: 100 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    await act(async () => {
      harness.stageProps.onMouseMove({
        evt: { clientX: 200, clientY: 200 },
      });
    });

    const stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-x'))).toBe(0);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(0);
  });

  it('updates pan anchor when zooming during an active pan so subsequent movement does not jump', async () => {
    await harness.render();

    // 1. Start pan at (100, 100)
    await act(async () => {
      harness.stageProps.onMouseDown({
        evt: { button: 0, clientX: 100, clientY: 100 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    // 2. Drag to (120, 120) -> stage moved by (+20, +20)
    await act(async () => {
      harness.stageProps.onMouseMove({
        evt: { clientX: 120, clientY: 120 },
      });
    });

    let stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-x'))).toBe(20);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(20);

    // 3. Zoom during the pan at pointer (120, 120)
    harness.stage.getPointerPosition = () => ({ x: 120, y: 120 });
    await act(async () => {
      harness.stageProps.onWheel({
        evt: { deltaY: -100, preventDefault: vi.fn(), clientX: 120, clientY: 120 },
        target: { getStage: () => harness.stage },
      });
    });

    stageEl = harness.stageElement;
    // Zoom in by 1.1 centered at (120, 120) with previous pos (20, 20):
    // pos = 120 - (120 - 20) * 1.1 = 120 - 110 = 10
    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(1.1, 4);
    expect(Number(stageEl.getAttribute('data-x'))).toBeCloseTo(10, 4);
    expect(Number(stageEl.getAttribute('data-y'))).toBeCloseTo(10, 4);

    // 4. Continue dragging to (130, 130) (an additional +10, +10 movement)
    await act(async () => {
      harness.stageProps.onMouseMove({
        evt: { clientX: 130, clientY: 130 },
      });
    });

    stageEl = harness.stageElement;
    // It should smoothly pan from post-zoom pos (10, 10) by (+10, +10) -> (20, 20),
    // NOT jump to (30, 30) from the stale pre-zoom anchor.
    expect(Number(stageEl.getAttribute('data-x'))).toBeCloseTo(20, 4);
    expect(Number(stageEl.getAttribute('data-y'))).toBeCloseTo(20, 4);

    // 5. Release mouse
    await act(async () => {
      harness.stageProps.onMouseUp();
    });
  });

  it('does NOT zoom when deltaY is zero (horizontal-only wheel event)', async () => {
    await harness.render();

    harness.stage.getPointerPosition = () => ({ x: 400, y: 300 });

    await act(async () => {
      harness.stageProps.onWheel({
        evt: { deltaY: 0, deltaX: 50, preventDefault: vi.fn() },
        target: { getStage: () => harness.stage },
      });
    });

    const stageEl = harness.stageElement;
    expect(Number(stageEl.getAttribute('data-scalex'))).toBe(1);
    expect(Number(stageEl.getAttribute('data-x'))).toBe(0);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(0);
  });

  it('maintains independent camera state across multiple Board instances', async () => {
    function TestHost() {
      return (
        <div>
          <Board activeMapUrl="https://example.com/mapA.png" width={800} height={600} />
          <Board activeMapUrl="https://example.com/mapB.png" width={800} height={600} />
        </div>
      );
    }

    await harness.renderRaw(<TestHost />);

    const stages = harness.container.querySelectorAll('[data-testid="stage"]');
    expect(stages.length).toBe(2);
    expect(harness.stageInstances.length).toBe(2);

    const stageA = harness.getStage(0);
    const stageB = harness.getStage(1);

    // Zoom instance A
    await act(async () => {
      stageA.props.onWheel({
        evt: { deltaY: -100, preventDefault: vi.fn(), clientX: 400, clientY: 300 },
        target: { getStage: () => stageA },
      });
    });

    // Pan instance B
    await act(async () => {
      stageB.props.onMouseDown({
        evt: { button: 0, clientX: 0, clientY: 0 },
        target: { name: () => '', hasName: () => false },
      });
      stageB.props.onMouseMove({
        evt: { clientX: 80, clientY: 60 },
      });
    });

    const updatedStages = harness.container.querySelectorAll('[data-testid="stage"]');
    // Instance A zoomed, instance B did not:
    expect(Number(updatedStages[0].getAttribute('data-scalex'))).toBeCloseTo(1.1, 4);
    expect(Number(updatedStages[1].getAttribute('data-scalex'))).toBe(1);

    // Instance B panned, instance A did not:
    expect(Number(updatedStages[1].getAttribute('data-x'))).toBe(80);
    expect(Number(updatedStages[1].getAttribute('data-y'))).toBe(60);
    expect(Number(updatedStages[0].getAttribute('data-x'))).toBeCloseTo(-40, 4);
    expect(Number(updatedStages[0].getAttribute('data-y'))).toBeCloseTo(-30, 4);
  });
});
