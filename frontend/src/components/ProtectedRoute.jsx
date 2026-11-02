import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

// Gate for authenticated-only routes. While the session is resolving we render
// nothing meaningful; once resolved, unauthenticated users go to /login.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <p className="auth-loading">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
