import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { createRoom, joinRoom, validateJoinDetails, validateRoomDetails } from '../lib/rooms.js';
import { connectSocket, joinRoomChannel } from '../lib/socket.js';
import { supabase } from '../lib/supabaseClient.js';

export default function HostJoinPage() {
  const { session, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roomCode, setRoomCode] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

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

  async function handleJoinRoom(event) {
    event.preventDefault();
    const validationError = validateJoinDetails({ roomCode: joinCode, password: joinPassword });
    if (validationError) {
      setJoinError(validationError);
      return;
    }

    setJoinError(null);
    setIsJoining(true);
    let socket;
    try {
      const roomId = await joinRoom(supabase, { roomCode: joinCode, password: joinPassword });
      socket = connectSocket(session.access_token);
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      await joinRoomChannel(socket, roomId);
      navigate(`/game/${roomId}`);
    } catch (joinError) {
      socket?.disconnect();
      setJoinError(joinError.message || 'Unable to join room.');
    } finally {
      setIsJoining(false);
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
      <section className="card">
        <h2>Join Room</h2>
        <form onSubmit={handleJoinRoom}>
          <label>
            Room code
            <input
              type="text"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={joinPassword}
              onChange={(event) => setJoinPassword(event.target.value)}
              required
            />
          </label>
          {joinError && <p role="alert">{joinError}</p>}
          <button type="submit" className="btn" disabled={isJoining}>
            {isJoining ? 'Joining…' : 'Join Room'}
          </button>
        </form>
      </section>
    </main>
  );
}
