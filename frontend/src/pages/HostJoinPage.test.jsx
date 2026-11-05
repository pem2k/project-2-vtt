import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HostJoinPage from './HostJoinPage.jsx';

vi.mock('../hooks/useAuth.jsx', () => ({
  useAuth: () => ({
    session: { access_token: 'test-token' },
    user: { email: 'dm@test.dev' },
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  supabase: {},
}));

describe('HostJoinPage selection screen', () => {
  it('initially shows Host and Join actions without a password field', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HostJoinPage />
      </MemoryRouter>,
    );

    expect(markup).toMatch(/Host/);
    expect(markup).toMatch(/Join/);
    expect(markup).not.toMatch(/type="password"/);
  });

  it('shows a Log out button on the selection screen', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HostJoinPage />
      </MemoryRouter>,
    );

    expect(markup).toMatch(/>Log out</);
  });

  it('shows "Signed in as <email>" text on the selection screen', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HostJoinPage />
      </MemoryRouter>,
    );

    expect(markup).toContain('Signed in as dm@test.dev');
  });

  it('does not render the page-user header', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HostJoinPage />
      </MemoryRouter>,
    );

    expect(markup).not.toMatch(/page-user/);
  });

  it('renders Log out and signed-in text outside and below the auth-card', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <HostJoinPage />
      </MemoryRouter>,
    );

    // The auth-card should close before the Log out button appears
    const cardCloseIndex = markup.lastIndexOf('</section>');
    const logoutIndex = markup.indexOf('>Log out<');
    const signedInIndex = markup.indexOf('Signed in as');

    expect(logoutIndex).toBeGreaterThan(cardCloseIndex);
    expect(signedInIndex).toBeGreaterThan(cardCloseIndex);
  });
});
