import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import Board from './Board.jsx';
import { MIN_SCALE, MAX_SCALE } from '../../lib/camera.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let latestStageProps = null;
let latestStageInstance = null;
const stageInstances = [];

vi.mock('react-konva', () => {
  return {
    Stage: React.forwardRef((props, ref) => {
      latestStageProps = props;
      const stageObj = {
        props,
        getPointerPosition: () => ({ x: 400, y: 300 }),
      };
      latestStageInstance = stageObj;
      stageInstances.push(stageObj);
      if (ref) {
        if (typeof ref === 'function') ref(stageObj);
        else ref.current = stageObj;
      }

      return (
        <div
          data-testid="stage"
          data-width={props.width}
          data-height={props.height}
          data-x={props.x}
          data-y={props.y}
          data-scalex={props.scaleX}
          data-scaley={props.scaleY}
          onWheel={props.onWheel}
          onMouseDown={props.onMouseDown}
          onMouseMove={props.onMouseMove}
          onMouseUp={props.onMouseUp}
        >
          {props.children}
        </div>
      );
    }),
    Layer: ({ children }) => <div data-testid="layer">{children}</div>,
    Image: ({ width, height }) => (
      <div data-testid="konva-image" data-width={width} data-height={height} />
    ),
    Group: ({ children, x, y, name, listening }) => (
      <div
        data-testid="token-group"
        data-x={x}
        data-y={y}
        data-name={name}
        data-listening={listening ? 'true' : 'false'}
      >
        {children}
      </div>
    ),
    Circle: ({ radius, fill, dash }) => (
      <div
        data-testid="token-circle"
        data-radius={radius}
        data-fill={fill}
        data-dash={dash ? dash.join(',') : undefined}
      />
    ),
    Text: ({ text, fill, stroke }) => (
      <div data-testid="token-text" data-fill={fill} data-stroke={stroke}>
        {text}
      </div>
    ),
    Line: () => <div data-testid="grid-line" />,
  };
});

describe('Board component', () => {
  let container;
  let root;

  beforeEach(() => {
    stageInstances.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    try {
      if (root) {
        await act(async () => {
          root.unmount();
        });
        root = null;
      }
    } finally {
      try {
        if (container?.parentNode) {
          container.parentNode.removeChild(container);
          container = null;
        }
      } finally {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      }
    }
  });

  it('renders empty fallback when activeMapUrl is not provided', () => {
    const markup = renderToStaticMarkup(<Board activeMapUrl={null} />);
    expect(markup).toContain('board-empty');
    expect(markup).toContain('No map active. Ask the DM to upload a map.');
  });

  it('renders tokens at (x + 0.5) * cellSize with their names', () => {
    const tokens = [
      { id: 't1', name: 'Aria', color: '#4363D8', x: 2, y: 3 },
      { id: 't2', name: 'Goblin Scout', color: '#E6194B', x: 5, y: 5 },
    ];

    const markup = renderToStaticMarkup(
      <Board
        activeMapUrl="https://example.com/map.png"
        width={800}
        height={600}
        cellSize={50}
        tokens={tokens}
      />,
    );

    // Both names should be rendered
    expect(markup).toContain('Aria');
    expect(markup).toContain('Goblin Scout');

    // Check pixel calculations: (2 + 0.5) * 50 = 125, (3 + 0.5) * 50 = 175
    expect(markup).toContain('data-x="125"');
    expect(markup).toContain('data-y="175"');

    // Check pixel calculations: (5 + 0.5) * 50 = 275, (5 + 0.5) * 50 = 275
    expect(markup).toContain('data-x="275"');
    expect(markup).toContain('data-y="275"');
  });

  it('renders only token name on the map (no player name) with dashed outline for unassigned', () => {
    const tokens = [
      { id: 't1', name: 'Aria', color: '#4363D8', x: 2, y: 3, assigned_to: 'user-p1' },
      { id: 't2', name: 'Goblin Scout', color: '#E6194B', x: 5, y: 5, assigned_to: null },
    ];

    const markup = renderToStaticMarkup(
      <Board
        activeMapUrl="https://example.com/map.png"
        width={800}
        height={600}
        cellSize={50}
        tokens={tokens}
      />,
    );

    // Token name is rendered, but player name is not shown on the map
    expect(markup).toContain('Aria');
    expect(markup).not.toContain('Player One');

    // Token name renders high-contrast white text with black border
    expect(markup).toContain('data-fill="#ffffff" data-stroke="#000000"');

    // Unassigned token renders dashed outline
    expect(markup).toContain('data-dash="4,3"');
  });

  it('initializes with scale = 1.0 and position = (0, 0)', async () => {
    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    const stageEl = container.querySelector('[data-testid="stage"]');
    expect(stageEl.getAttribute('data-scalex')).toBe('1');
    expect(stageEl.getAttribute('data-scaley')).toBe('1');
    expect(stageEl.getAttribute('data-x')).toBe('0');
    expect(stageEl.getAttribute('data-y')).toBe('0');
  });

  it('zooms in centered on pointer position on wheel event', async () => {
    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    latestStageInstance.getPointerPosition = () => ({ x: 400, y: 300 });

    const preventDefaultSpy = vi.fn();
    await act(async () => {
      latestStageProps.onWheel({
        evt: { deltaY: -100, preventDefault: preventDefaultSpy },
        target: { getStage: () => latestStageInstance },
      });
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
    const stageEl = container.querySelector('[data-testid="stage"]');
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
    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    latestStageInstance.getPointerPosition = () => ({ x: 400, y: 300 });

    // Repeated zoom in:
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        latestStageProps.onWheel({
          evt: { deltaY: -100, preventDefault: vi.fn() },
          target: { getStage: () => latestStageInstance },
        });
      });
    }

    let stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(MAX_SCALE, 4);

    // Repeated zoom out:
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        latestStageProps.onWheel({
          evt: { deltaY: 100, preventDefault: vi.fn() },
          target: { getStage: () => latestStageInstance },
        });
      });
    }

    stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(MIN_SCALE, 4);
  });

  it('pans stage on primary-button mouse drag on empty board space', async () => {
    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    const boardContainer = container.querySelector('.board-container');
    expect(boardContainer.style.cursor).toBe('grab');

    // Mousedown on empty background
    await act(async () => {
      latestStageProps.onMouseDown({
        evt: { button: 0, clientX: 100, clientY: 100 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    expect(boardContainer.style.cursor).toBe('grabbing');

    // Mousemove drag
    await act(async () => {
      latestStageProps.onMouseMove({
        evt: { clientX: 160, clientY: 140 },
      });
    });

    const stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-x'))).toBe(60);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(40);

    // Mouseup ends panning
    await act(async () => {
      latestStageProps.onMouseUp();
    });

    expect(boardContainer.style.cursor).toBe('grab');
  });

  it('does NOT pan when dragging begins on a token', async () => {
    await act(async () => {
      root.render(
        <Board
          activeMapUrl="https://example.com/map.png"
          width={800}
          height={600}
          cellSize={50}
          tokens={[{ id: 't1', name: 'Aria', x: 1, y: 1 }]}
        />,
      );
    });

    // Mousedown on token
    await act(async () => {
      latestStageProps.onMouseDown({
        evt: { button: 0, clientX: 100, clientY: 100 },
        target: { name: () => 'token', hasName: (n) => n === 'token', findAncestor: () => null },
      });
    });

    // Mousemove drag
    await act(async () => {
      latestStageProps.onMouseMove({
        evt: { clientX: 200, clientY: 200 },
      });
    });

    // Position remains untouched at 0, 0
    const stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-x'))).toBe(0);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(0);
  });

  it('does NOT pan when dragging with a non-primary mouse button', async () => {
    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    // Right click (button === 2)
    await act(async () => {
      latestStageProps.onMouseDown({
        evt: { button: 2, clientX: 100, clientY: 100 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    await act(async () => {
      latestStageProps.onMouseMove({
        evt: { clientX: 200, clientY: 200 },
      });
    });

    const stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-x'))).toBe(0);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(0);
  });

  it('updates pan anchor when zooming during an active pan so subsequent movement does not jump', async () => {
    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    // 1. Start pan at (100, 100)
    await act(async () => {
      latestStageProps.onMouseDown({
        evt: { button: 0, clientX: 100, clientY: 100 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    // 2. Drag to (120, 120) -> stage moved by (+20, +20)
    await act(async () => {
      latestStageProps.onMouseMove({
        evt: { clientX: 120, clientY: 120 },
      });
    });

    let stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-x'))).toBe(20);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(20);

    // 3. Zoom during the pan at pointer (120, 120)
    latestStageInstance.getPointerPosition = () => ({ x: 120, y: 120 });
    await act(async () => {
      latestStageProps.onWheel({
        evt: { deltaY: -100, preventDefault: vi.fn(), clientX: 120, clientY: 120 },
        target: { getStage: () => latestStageInstance },
      });
    });

    stageEl = container.querySelector('[data-testid="stage"]');
    // Zoom in by 1.1 centered at (120, 120) with previous pos (20, 20):
    // pos = 120 - (120 - 20) * 1.1 = 120 - 110 = 10
    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(1.1, 4);
    expect(Number(stageEl.getAttribute('data-x'))).toBeCloseTo(10, 4);
    expect(Number(stageEl.getAttribute('data-y'))).toBeCloseTo(10, 4);

    // 4. Continue dragging to (130, 130) (an additional +10, +10 movement)
    await act(async () => {
      latestStageProps.onMouseMove({
        evt: { clientX: 130, clientY: 130 },
      });
    });

    stageEl = container.querySelector('[data-testid="stage"]');
    // It should smoothly pan from post-zoom pos (10, 10) by (+10, +10) -> (20, 20),
    // NOT jump to (30, 30) from the stale pre-zoom anchor.
    expect(Number(stageEl.getAttribute('data-x'))).toBeCloseTo(20, 4);
    expect(Number(stageEl.getAttribute('data-y'))).toBeCloseTo(20, 4);

    // 5. Release mouse
    await act(async () => {
      latestStageProps.onMouseUp();
    });
  });

  it('does NOT zoom when deltaY is zero (horizontal-only wheel event)', async () => {
    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    latestStageInstance.getPointerPosition = () => ({ x: 400, y: 300 });

    await act(async () => {
      latestStageProps.onWheel({
        evt: { deltaY: 0, deltaX: 50, preventDefault: vi.fn() },
        target: { getStage: () => latestStageInstance },
      });
    });

    const stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-scalex'))).toBe(1);
    expect(Number(stageEl.getAttribute('data-x'))).toBe(0);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(0);
  });

  it('measures container with ResizeObserver and enlarges Stage without stretching the map', async () => {
    let resizeCallback = null;
    class MockResizeObserver {
      constructor(callback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // Mock Image so useKonvaImage loads
    class MockImage {
      constructor() {
        this._listeners = {};
      }
      addEventListener(event, cb) {
        this._listeners[event] = cb;
      }
      removeEventListener(event) {
        delete this._listeners[event];
      }
      set src(val) {
        setTimeout(() => {
          if (this._listeners.load) this._listeners.load();
        }, 0);
      }
    }
    vi.stubGlobal('Image', MockImage);

    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    // Wait for image load event to update state
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const stageEl = container.querySelector('[data-testid="stage"]');
    const imageEl = container.querySelector('[data-testid="konva-image"]');
    expect(Number(stageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(600);
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);

    // Simulate container resize via ResizeObserver:
    await act(async () => {
      resizeCallback([{ contentRect: { width: 1200, height: 900 } }]);
    });

    // Stage updates to measured container size (1200x900)
    expect(Number(stageEl.getAttribute('data-width'))).toBe(1200);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(900);

    // Logical map dimensions stay stable at 800x600 (not stretched!)
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);
  });

  it('allows panning and zooming from blank space outside the map area', async () => {
    let resizeCallback = null;
    class MockResizeObserver {
      constructor(callback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    await act(async () => {
      root.render(
        <Board activeMapUrl="https://example.com/map.png" width={800} height={600} cellSize={50} />,
      );
    });

    // Enlarge Stage to 1200x900 so there is blank space around 800x600 map
    await act(async () => {
      resizeCallback([{ contentRect: { width: 1200, height: 900 } }]);
    });

    // 1. Pan gesture from blank space at (1000, 750) outside map:
    await act(async () => {
      latestStageProps.onMouseDown({
        evt: { button: 0, clientX: 1000, clientY: 750 },
        target: { name: () => '', hasName: () => false, findAncestor: () => null },
      });
    });

    await act(async () => {
      latestStageProps.onMouseMove({
        evt: { clientX: 1050, clientY: 780 },
      });
    });

    const stageEl = container.querySelector('[data-testid="stage"]');
    expect(Number(stageEl.getAttribute('data-x'))).toBe(50);
    expect(Number(stageEl.getAttribute('data-y'))).toBe(30);

    await act(async () => {
      latestStageProps.onMouseUp();
    });

    // 2. Wheel zoom over blank space at (1000, 750):
    latestStageInstance.getPointerPosition = () => ({ x: 1000, y: 750 });
    await act(async () => {
      latestStageProps.onWheel({
        evt: { deltaY: -100, preventDefault: vi.fn(), clientX: 1000, clientY: 750 },
        target: { getStage: () => latestStageInstance },
      });
    });

    expect(Number(stageEl.getAttribute('data-scalex'))).toBeCloseTo(1.1, 4);
  });

  it('preserves token alignment to map grid when viewport resizes', async () => {
    let resizeCallback = null;
    class MockResizeObserver {
      constructor(callback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    const tokens = [{ id: 't1', name: 'Aria', x: 2, y: 3 }];

    await act(async () => {
      root.render(
        <Board
          activeMapUrl="https://example.com/map.png"
          width={800}
          height={600}
          cellSize={50}
          tokens={tokens}
        />,
      );
    });

    const tokenEl = container.querySelector('[data-testid="token-group"]');
    // Initial pixel coords on map: (2 + 0.5) * 50 = 125, (3 + 0.5) * 50 = 175
    expect(Number(tokenEl.getAttribute('data-x'))).toBe(125);
    expect(Number(tokenEl.getAttribute('data-y'))).toBe(175);

    // Resize viewport to 1400x1000
    await act(async () => {
      resizeCallback([{ contentRect: { width: 1400, height: 1000 } }]);
    });

    // Token coordinates remain exactly at (125, 175) on the map coordinate system
    expect(Number(tokenEl.getAttribute('data-x'))).toBe(125);
    expect(Number(tokenEl.getAttribute('data-y'))).toBe(175);
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

    await act(async () => {
      root.render(<TestHost />);
    });

    const stages = container.querySelectorAll('[data-testid="stage"]');
    expect(stages.length).toBe(2);
    expect(stageInstances.length).toBe(2);

    // Zoom instance A
    await act(async () => {
      stageInstances[0].props.onWheel({
        evt: { deltaY: -100, preventDefault: vi.fn(), clientX: 400, clientY: 300 },
        target: { getStage: () => stageInstances[0] },
      });
    });

    // Pan instance B
    await act(async () => {
      stageInstances[1].props.onMouseDown({
        evt: { button: 0, clientX: 0, clientY: 0 },
        target: { name: () => '', hasName: () => false },
      });
      stageInstances[1].props.onMouseMove({
        evt: { clientX: 80, clientY: 60 },
      });
    });

    const updatedStages = container.querySelectorAll('[data-testid="stage"]');
    // Instance A zoomed, instance B did not:
    expect(Number(updatedStages[0].getAttribute('data-scalex'))).toBeCloseTo(1.1, 4);
    expect(Number(updatedStages[1].getAttribute('data-scalex'))).toBe(1);

    // Instance B panned, instance A did not:
    expect(Number(updatedStages[1].getAttribute('data-x'))).toBe(80);
    expect(Number(updatedStages[1].getAttribute('data-y'))).toBe(60);
    expect(Number(updatedStages[0].getAttribute('data-x'))).toBeCloseTo(-40, 4);
    expect(Number(updatedStages[0].getAttribute('data-y'))).toBeCloseTo(-30, 4);
  });

  it('attaches ResizeObserver on initial empty mount and updates Stage when first map appears', async () => {
    let resizeCallback = null;
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();

    class MockResizeObserver {
      constructor(callback) {
        resizeCallback = callback;
        this.observe = observeSpy;
        this.disconnect = disconnectSpy;
      }
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    class MockImage {
      constructor() {
        this._listeners = {};
      }
      addEventListener(event, cb) {
        this._listeners[event] = cb;
      }
      removeEventListener(event) {
        delete this._listeners[event];
      }
      set src(val) {
        setTimeout(() => {
          if (this._listeners.load) this._listeners.load();
        }, 0);
      }
    }
    vi.stubGlobal('Image', MockImage);

    // 1. Mount Board with no active map initially
    await act(async () => {
      root.render(<Board activeMapUrl={null} width={800} height={600} cellSize={50} />);
    });

    const boardContainer = container.querySelector('.board-container');
    expect(boardContainer).not.toBeNull();
    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(observeSpy).toHaveBeenCalledWith(boardContainer);
    expect(container.querySelector('.board-empty')).not.toBeNull();
    expect(container.querySelector('[data-testid="stage"]')).toBeNull();
    expect(disconnectSpy).not.toHaveBeenCalled();

    // 2. Supply the first active map
    await act(async () => {
      root.render(
        <Board
          activeMapUrl="https://example.com/first-map.png"
          width={800}
          height={600}
          cellSize={50}
        />,
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const stageEl = container.querySelector('[data-testid="stage"]');
    const imageEl = container.querySelector('[data-testid="konva-image"]');
    expect(stageEl).not.toBeNull();
    expect(imageEl).not.toBeNull();
    expect(Number(stageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(600);
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);

    // 3. Resize the container via the observer callback
    await act(async () => {
      resizeCallback([{ contentRect: { width: 1400, height: 950 } }]);
    });

    // Stage dimensions update to container size while logical map dimensions stay unchanged
    expect(Number(stageEl.getAttribute('data-width'))).toBe(1400);
    expect(Number(stageEl.getAttribute('data-height'))).toBe(950);
    expect(Number(imageEl.getAttribute('data-width'))).toBe(800);
    expect(Number(imageEl.getAttribute('data-height'))).toBe(600);

    // 4. Verify observer cleanup on unmount
    await act(async () => {
      root.unmount();
      root = null;
    });
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
