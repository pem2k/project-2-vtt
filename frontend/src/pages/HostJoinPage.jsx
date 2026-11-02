import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { createRoom, validateRoomDetails } from '../lib/rooms.js';
import { supabase } from '../lib/supabaseClient.js';

export default function HostJoinPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roomCode, setRoomCode] = useState(null);

  async function handleCreateRoom(event) {
    event.preventDefault();
    const validationError = validateRoomDetails({ roomName, password });
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const room = await createRoom(supabase, { roomName, password });
      setRoomCode(room.room_code);
      navigate(`/game/${room.id}`, { state: { roomCode: room.room_code } });
    } catch (createError) {
      setError(createError.message || 'Unable to create room.');
    } finally {
      setIsSubmitting(false);
    }
  }

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
      <section className="card">
        <h2>Create Room</h2>
        <form onSubmit={handleCreateRoom}>
          <label>
            Room name
            <input
              type="text"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          {roomCode && <p>Your room code is: {roomCode}</p>}
          <button type="submit" className="btn" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Room'}
          </button>
        </form>
      </section>
    </main>
  );
}
