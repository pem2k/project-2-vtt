import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HostJoinPage from '../HostJoinPage.jsx';

vi.mock('../../hooks/useAuth.jsx', () => ({
  useAuth: () => ({
    session: { access_token: 'test-token' },
    user: { email: 'dm@test.dev' },
    signOut: vi.fn(),
  }),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {},
}));

describe('HostJoinPage selection screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderHostJoinPage() {
    return renderToStaticMarkup(
      <MemoryRouter>
        <HostJoinPage />
      </MemoryRouter>,
    );
  }

  it('initially shows Host and Join actions without a password field', () => {
    const markup = renderHostJoinPage();

    expect(markup).toMatch(/Host/);
    expect(markup).toMatch(/Join/);
    expect(markup).not.toMatch(/type="password"/);
  });

  it('shows a Log out button on the selection screen', () => {
    const markup = renderHostJoinPage();

    expect(markup).toMatch(/>Log out</);
  });

  it('shows "Signed in as <email>" text on the selection screen', () => {
    const markup = renderHostJoinPage();

    expect(markup).toContain('Signed in as dm@test.dev');
  });
});
