import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GamePage from './GamePage.jsx';

describe('GamePage route', () => {
  it('does not render the internal room uuid from /game/:roomId', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/game/room-123']}>
        <Routes>
          <Route path="/game/:roomId" element={<GamePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).not.toMatch(/room-123/);
  });
});
