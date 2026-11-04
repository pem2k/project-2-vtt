import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { createRoom, joinRoom, validateJoinDetails, validateRoomDetails } from '../lib/rooms.js';
import { connectSocket, joinRoomChannel } from '../lib/socket.js';
import { supabase } from '../lib/supabaseClient.js';

export default function HostJoinPage() {
  const { session, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [screen, setScreen] = useState('selection');
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const roomId = await createRoom(supabase, { roomName, password });
      navigate(`/game/${roomId}`);
    } catch (createError) {
      setError(createError.message || 'Unable to create room.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleJoinRoom(event) {
    event.preventDefault();
    const validationError = validateJoinDetails({ roomName, password });
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    let socket;
    try {
      const roomId = await joinRoom(supabase, { roomName, password });
      socket = connectSocket(session.access_token);
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      await joinRoomChannel(socket, roomId);
      navigate(`/game/${roomId}`);
    } catch (joinError) {
      socket?.disconnect();
      setError(joinError.message || 'Unable to join room.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  function showForm(nextScreen) {
    setScreen(nextScreen);
    setRoomName('');
    setPassword('');
    setError(null);
  }

  return (
    <main className="auth-page">
      <header className="page-user">
        {user?.email && <span className="page-email">{user.email}</span>}
        <button type="button" className="btn" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <section className="auth-card">
        {screen === 'selection' && (
          <>
            <h1 className="auth-title">Join a Game</h1>
            <p className="auth-subtitle">Choose how you want to enter the game.</p>
            <div className="auth-form">
              <button type="button" className="auth-submit" onClick={() => showForm('host')}>
                Host
              </button>
              <button type="button" className="auth-submit" onClick={() => showForm('join')}>
                Join
              </button>
            </div>
          </>
        )}

        {screen === 'host' && (
          <>
            <h1 className="auth-title">Room Setup</h1>
            <p className="auth-subtitle">Create a room for your game.</p>
            <form className="auth-form" onSubmit={handleCreateRoom} noValidate>
              <label className="auth-field">
                <span>Room name</span>
                <input
                  type="text"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  required
                />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create Room'}
              </button>
              <button type="button" className="auth-link" onClick={() => setScreen('selection')}>
                Back
              </button>
            </form>
          </>
        )}

        {screen === 'join' && (
          <>
            <h1 className="auth-title">Room Login</h1>
            <p className="auth-subtitle">Enter the room name and password.</p>
            <form className="auth-form" onSubmit={handleJoinRoom} noValidate>
              <label className="auth-field">
                <span>Room name</span>
                <input
                  type="text"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  required
                />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Joining…' : 'Join Room'}
              </button>
              <button type="button" className="auth-link" onClick={() => setScreen('selection')}>
                Back
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
