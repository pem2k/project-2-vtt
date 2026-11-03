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
});
