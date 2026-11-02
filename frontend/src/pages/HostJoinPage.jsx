import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

// Lobby shell. The Host / Join controls arrive in #5 / #6; for #4 this just
// proves the post-login landing spot and provides logout.
export default function HostJoinPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Join a Game</h1>
        <div className="page-user">
          {user?.email && <span className="page-email">{user.email}</span>}
          <button type="button" className="btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <p className="page-placeholder">Host or join a room — coming in #5 / #6.</p>
    </main>
  );
}
