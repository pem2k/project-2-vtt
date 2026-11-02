import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { validateCredentials, authErrorMessage } from '../lib/auth.js';

// Landing page: one form that toggles between logging in and signing up.
export default function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. refreshed on /login) → go to the lobby.
  if (user) return <Navigate to="/" replace />;

  const isSignup = mode === 'signup';

  function switchMode() {
    setMode(isSignup ? 'login' : 'signup');
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const validationError = validateCredentials(
      { email, password },
      { requireStrongPassword: isSignup },
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    const action = isSignup ? signUp : signIn;
    const { data, error: authError } = await action(email.trim(), password);
    setBusy(false);

    if (authError) {
      setError(authErrorMessage(authError));
      return;
    }

    // If email confirmation is enabled, signUp returns no session yet.
    if (isSignup && !data?.session) {
      setInfo('Account created. Check your email to confirm, then log in.');
      setMode('login');
      return;
    }

    navigate('/', { replace: true });
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1 className="auth-title">oPeN VTT</h1>
        <p className="auth-subtitle">{isSignup ? 'Create your account' : 'Log in to play'}</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-field">
            <span className="visually-hidden">Email</span>
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span className="visually-hidden">Password</span>
            <input
              type="password"
              placeholder="Password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="auth-info" role="status">
              {info}
            </p>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <p className="auth-toggle">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="auth-link" onClick={switchMode}>
            {isSignup ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </section>
    </main>
  );
}
