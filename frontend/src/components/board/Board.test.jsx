import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Board from './Board.jsx';

vi.mock('react-konva', () => {
  return {
    Stage: ({ children, width, height }) => (
      <div data-testid="stage" data-width={width} data-height={height}>
        {children}
      </div>
    ),
    Layer: ({ children }) => <div data-testid="layer">{children}</div>,
    Image: ({ width, height }) => (
      <div data-testid="konva-image" data-width={width} data-height={height} />
    ),
    Group: ({ children, x, y }) => (
      <div data-testid="token-group" data-x={x} data-y={y}>
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
});
