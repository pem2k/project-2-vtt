import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Board from './Board.jsx';

describe('Board component', () => {
  it('renders empty fallback when activeMapUrl is not provided', () => {
    const markup = renderToStaticMarkup(<Board activeMapUrl={null} />);
    expect(markup).toContain('board-empty');
    expect(markup).toContain('No map active. Ask the DM to upload a map.');
  });
});
