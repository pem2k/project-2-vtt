import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getRoomName } from '../lib/rooms.js';
import { supabase } from '../lib/supabaseClient.js';

// Protected placeholder — the Konva board, tokens, character cards, and dice
// land in later issues. Here it just exists as a guarded route target.
export default function GamePage() {
  const { roomId } = useParams();
  const [roomName, setRoomName] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    getRoomName(supabase, roomId)
      .then((name) => {
        if (active) setRoomName(name);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load room.');
      });

    return () => {
      active = false;
    };
  }, [roomId]);

  return (
    <main className="page">
      <h1>Game</h1>
      {roomName && <p>Room: {roomName}</p>}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <p className="page-placeholder">The board, tokens, and dice live here — coming soon.</p>
    </main>
  );
}
