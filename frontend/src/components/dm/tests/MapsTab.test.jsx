import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MapsTab from '../MapsTab.jsx';

describe('MapsTab component', () => {
  it('renders upload area, grid controls, and maps list', () => {
    const markup = renderToStaticMarkup(
      <MapsTab
        roomId="room-1"
        showGrid={true}
        gridCellSize={60}
        onToggleGrid={vi.fn()}
        onChangeGridCellSize={vi.fn()}
      />,
    );

    // Upload button and hidden input
    expect(markup).toContain('id="map-file-input"');
    expect(markup).toContain('Upload Map');
    expect(markup).toContain('aria-label="Click or drop your map image here to upload"');

    // Grid toggle button and slider
    expect(markup).toContain('Hide Grid');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Grid Size');
    expect(markup).toContain('60px');
    expect(markup).toContain('id="dm-grid-size-slider"');

    // Empty maps state by default
    expect(markup).toContain('No maps uploaded yet.');
  });

  it('renders disabled slider and Show Grid text when grid is hidden', () => {
    const markup = renderToStaticMarkup(
      <MapsTab
        roomId="room-1"
        showGrid={false}
        gridCellSize={40}
        onToggleGrid={vi.fn()}
        onChangeGridCellSize={vi.fn()}
      />,
    );

    expect(markup).toContain('Show Grid');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('disabled=""');
  });

  it('renders list of maps with active badge on matching activeMapId', () => {
    const maps = [
      { id: 'map-1', name: 'Dungeon Level 1' },
      { id: 'map-2', name: 'Cave Hideout' },
    ];

    const markup = renderToStaticMarkup(
      <MapsTab
        roomId="room-1"
        activeMapId="map-2"
        initialMaps={maps}
        showGrid={true}
        gridCellSize={50}
      />,
    );

    expect(markup).toContain('Dungeon Level 1');
    expect(markup).toContain('Cave Hideout');
    expect(markup).toContain('dm-map-active-badge');
    expect(markup).toContain('Active');
  });
});
