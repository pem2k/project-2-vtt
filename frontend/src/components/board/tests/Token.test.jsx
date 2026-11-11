import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Token from '../Token.jsx';

let latestGroupProps = null;

vi.mock('react-konva', () => {
  return {
    Group: (props) => {
      latestGroupProps = props;
      return (
        <div
          data-testid="token-group"
          data-name={props.name}
          data-x={props.x}
          data-y={props.y}
          data-draggable={props.draggable ? 'true' : 'false'}
        >
          {props.children}
        </div>
      );
    },
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
  };
});

describe('Token component permissions and drag', () => {
  const token = {
    id: 'token-1',
    name: 'Aria',
    color: '#4363D8',
    x: 2,
    y: 3,
    assigned_to: 'user-player-1',
  };

  const unassignedToken = {
    id: 'token-2',
    name: 'Goblin',
    color: '#E6194B',
    x: 5,
    y: 5,
    assigned_to: null,
  };

  it('renders high-contrast white text label with black outline and dashed circle for unassigned tokens', () => {
    // Assigned token
    const assignedMarkup = renderToStaticMarkup(
      <Token token={token} cellSize={50} currentUserId="user-player-1" />,
    );
    expect(assignedMarkup).toContain('data-fill="#ffffff"');
    expect(assignedMarkup).toContain('data-stroke="#000000"');
    expect(assignedMarkup).not.toContain('data-dash="4,3"');

    // Unassigned token
    const unassignedMarkup = renderToStaticMarkup(<Token token={unassignedToken} cellSize={50} />);
    expect(unassignedMarkup).toContain('data-dash="4,3"');
  });

  it('is NOT draggable when socket is not ready even for DM or owner', () => {
    // DM, not ready
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-dm"
        isDm={true}
        isSocketReady={false}
      />,
    );
    expect(latestGroupProps.draggable).toBe(false);

    // Owner, not ready
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-player-1"
        isDm={false}
        isSocketReady={false}
      />,
    );
    expect(latestGroupProps.draggable).toBe(false);
  });

  it('allows DM to drag any token when socket is ready', () => {
    // Assigned token
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-dm"
        isDm={true}
        isSocketReady={true}
      />,
    );
    expect(latestGroupProps.draggable).toBe(true);

    // Unassigned token
    renderToStaticMarkup(
      <Token
        token={unassignedToken}
        cellSize={50}
        currentUserId="user-dm"
        isDm={true}
        isSocketReady={true}
      />,
    );
    expect(latestGroupProps.draggable).toBe(true);
  });

  it('allows assigned player to drag their token when socket is ready', () => {
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-player-1"
        isDm={false}
        isSocketReady={true}
      />,
    );
    expect(latestGroupProps.draggable).toBe(true);
  });

  it('prevents players from dragging tokens assigned to others', () => {
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-player-2"
        isDm={false}
        isSocketReady={true}
      />,
    );
    expect(latestGroupProps.draggable).toBe(false);
  });

  it('prevents players from dragging unassigned tokens', () => {
    renderToStaticMarkup(
      <Token
        token={unassignedToken}
        cellSize={50}
        currentUserId="user-player-1"
        isDm={false}
        isSocketReady={true}
      />,
    );
    expect(latestGroupProps.draggable).toBe(false);
  });

  it('prevents drag when token is pending even for DM or owner', () => {
    // DM with isPending
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-dm"
        isDm={true}
        isSocketReady={true}
        isPending={true}
      />,
    );
    expect(latestGroupProps.draggable).toBe(false);

    // Assigned owner with isPending
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-player-1"
        isDm={false}
        isSocketReady={true}
        isPending={true}
      />,
    );
    expect(latestGroupProps.draggable).toBe(false);
  });

  it('converts drag end coordinates by inverting center formula and supports revert', () => {
    const onMoveToken = vi.fn();
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-player-1"
        isDm={false}
        isSocketReady={true}
        onMoveToken={onMoveToken}
      />,
    );

    const batchDraw = vi.fn();
    const position = vi.fn();
    const fakeNode = {
      x: () => 240, // 240 / 50 - 0.5 = 4.3
      y: () => 385, // 385 / 50 - 0.5 = 7.2
      position,
      getLayer: () => ({ batchDraw }),
    };

    latestGroupProps.onDragEnd({ target: fakeNode });
    expect(onMoveToken).toHaveBeenCalledWith(token, 4.3, 7.2, expect.any(Function));

    // Test revert callback
    const revertCallback = onMoveToken.mock.calls[0][3];
    revertCallback();
    // original: (2 + 0.5) * 50 = 125, (3 + 0.5) * 50 = 175
    expect(position).toHaveBeenCalledWith({ x: 125, y: 175 });
    expect(batchDraw).toHaveBeenCalled();
  });

  it('revert callback restores latest authoritative position rather than stale render coordinates', () => {
    const onMoveToken = vi.fn();
    renderToStaticMarkup(
      <Token
        token={token}
        cellSize={50}
        currentUserId="user-player-1"
        isDm={false}
        isSocketReady={true}
        onMoveToken={onMoveToken}
      />,
    );

    const batchDraw = vi.fn();
    const position = vi.fn();
    const fakeNode = {
      x: () => 240,
      y: () => 385,
      position,
      getLayer: () => ({ batchDraw }),
    };

    latestGroupProps.onDragEnd({ target: fakeNode });
    const revertCallback = onMoveToken.mock.calls[0][3];

    // Remote update arrived during in-flight request: x: 10, y: 12
    revertCallback({ id: 'token-1', x: 10, y: 12 });
    // (10 + 0.5) * 50 = 525, (12 + 0.5) * 50 = 625
    expect(position).toHaveBeenCalledWith({ x: 525, y: 625 });
    expect(batchDraw).toHaveBeenCalled();
  });
});
