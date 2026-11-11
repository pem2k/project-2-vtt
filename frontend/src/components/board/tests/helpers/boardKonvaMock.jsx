/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { vi } from 'vitest';

/**
 * Tracks mounted Konva Stage instances and their current props across renders.
 */
export const stageTracker = {
  instances: [],

  get current() {
    return this.instances[this.instances.length - 1] ?? null;
  },

  get props() {
    return this.current?.props ?? null;
  },

  get(index = 0) {
    return this.instances[index] ?? null;
  },

  reset() {
    this.instances = [];
  },
};

const Stage = React.forwardRef((props, ref) => {
  const instanceRef = React.useRef(null);
  if (instanceRef.current == null) {
    instanceRef.current = {
      props,
      getPointerPosition: vi.fn(() => ({ x: 400, y: 300 })),
    };
  }

  React.useLayoutEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.props = props;
    }
  });

  React.useImperativeHandle(ref, () => instanceRef.current);

  React.useEffect(() => {
    const inst = instanceRef.current;
    if (inst) {
      stageTracker.instances.push(inst);
    }
    return () => {
      stageTracker.instances = stageTracker.instances.filter((item) => item !== inst);
    };
  }, []);

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
});

Stage.displayName = 'Stage';

const Layer = ({ children }) => <div data-testid="layer">{children}</div>;

const Image = ({ width, height }) => (
  <div data-testid="konva-image" data-width={width} data-height={height} />
);

const Group = ({ children, x, y, name, listening, draggable, onDragEnd }) => {
  const fakeNode = {
    x: () => x,
    y: () => y,
    position: vi.fn(),
    getLayer: () => ({ batchDraw: vi.fn() }),
  };
  return (
    <div
      data-testid="token-group"
      data-x={x}
      data-y={y}
      data-name={name}
      data-listening={listening ? 'true' : 'false'}
      data-draggable={draggable ? 'true' : 'false'}
      onClick={(e) => {
        const target = e?.target && typeof e.target.x === 'function' ? e.target : fakeNode;
        onDragEnd?.({ target });
      }}
    >
      {children}
    </div>
  );
};

const Circle = ({ radius, fill, dash }) => (
  <div
    data-testid="token-circle"
    data-radius={radius}
    data-fill={fill}
    data-dash={dash ? dash.join(',') : undefined}
  />
);

const Text = ({ text, fill, stroke }) => (
  <div data-testid="token-text" data-fill={fill} data-stroke={stroke}>
    {text}
  </div>
);

const Line = () => <div data-testid="grid-line" />;

export const boardKonvaMock = {
  Stage,
  Layer,
  Image,
  Group,
  Circle,
  Text,
  Line,
};
