import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import Board from '../../Board.jsx';
import { stageTracker } from './boardKonvaMock.jsx';

/**
 * Controllable Image mock for deterministic useKonvaImage testing without setTimeout.
 */
export class ControllableImage {
  static instances = [];

  static reset() {
    ControllableImage.instances = [];
  }

  static get latest() {
    return ControllableImage.instances[ControllableImage.instances.length - 1] ?? null;
  }

  static async triggerLoad(index = -1) {
    const inst = index === -1 ? ControllableImage.latest : ControllableImage.instances[index];
    if (!inst) {
      throw new Error('No ControllableImage instance found to trigger load');
    }
    await act(async () => {
      inst.dispatchLoad();
    });
  }

  constructor() {
    this._listeners = new Map();
    this.src = '';
    this.crossOrigin = '';
    ControllableImage.instances.push(this);
  }

  addEventListener(event, cb) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(cb);
  }

  removeEventListener(event, cb) {
    this._listeners.get(event)?.delete(cb);
  }

  dispatchLoad() {
    const listeners = this._listeners.get('load');
    if (listeners) {
      for (const cb of listeners) {
        cb();
      }
    }
  }
}

/**
 * Controllable ResizeObserver mock retaining per-instance callbacks and observe/disconnect spies.
 */
export class ControllableResizeObserver {
  static instances = [];

  static reset() {
    ControllableResizeObserver.instances = [];
  }

  static get latest() {
    return (
      ControllableResizeObserver.instances[ControllableResizeObserver.instances.length - 1] ?? null
    );
  }

  static async triggerResize(width, height, index = -1) {
    const inst =
      index === -1
        ? ControllableResizeObserver.latest
        : ControllableResizeObserver.instances[index];
    if (!inst) {
      throw new Error('No ControllableResizeObserver instance found to trigger resize');
    }
    await inst.trigger(width, height);
  }

  constructor(callback) {
    this.callback = callback;
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    ControllableResizeObserver.instances.push(this);
  }

  async trigger(width, height) {
    await act(async () => {
      this.callback([{ contentRect: { width, height } }]);
    });
  }
}

const DEFAULT_BOARD_PROPS = {
  activeMapUrl: 'https://example.com/map.png',
  width: 800,
  height: 600,
  cellSize: 50,
};

/**
 * Test harness managing container, React root, Board rendering, and global mock restoration.
 */
export function createBoardHarness() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);

  ControllableImage.reset();
  ControllableResizeObserver.reset();
  vi.stubGlobal('Image', ControllableImage);
  vi.stubGlobal('ResizeObserver', ControllableResizeObserver);

  async function render(props = {}) {
    const mergedProps = {
      ...DEFAULT_BOARD_PROPS,
      ...props,
    };
    await act(async () => {
      root.render(<Board {...mergedProps} />);
    });
  }

  async function renderRaw(element) {
    await act(async () => {
      root.render(element);
    });
  }

  async function cleanup() {
    try {
      if (root) {
        await act(async () => {
          root.unmount();
        });
      }
    } finally {
      root = null;
      if (container?.parentNode) {
        container.parentNode.removeChild(container);
      }
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      stageTracker.reset();
      ControllableImage.reset();
      ControllableResizeObserver.reset();
    }
  }

  return {
    container,
    get root() {
      return root;
    },
    render,
    renderRaw,
    cleanup,
    get stage() {
      return stageTracker.current;
    },
    get stageProps() {
      return stageTracker.props;
    },
    get stageInstances() {
      return stageTracker.instances;
    },
    getStage(index = 0) {
      return stageTracker.get(index);
    },
    get stageElement() {
      return container.querySelector('[data-testid="stage"]');
    },
    get boardContainer() {
      return container.querySelector('.board-container');
    },
    get imageElement() {
      return container.querySelector('[data-testid="konva-image"]');
    },
    triggerImageLoad: ControllableImage.triggerLoad,
    triggerResize: ControllableResizeObserver.triggerResize,
    get latestObserver() {
      return ControllableResizeObserver.latest;
    },
    get observers() {
      return ControllableResizeObserver.instances;
    },
  };
}
