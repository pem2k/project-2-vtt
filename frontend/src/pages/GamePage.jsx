import { useLocation, useParams } from 'react-router-dom';

// Protected placeholder — the Konva board, tokens, character cards, and dice
// land in later issues. Here it just exists as a guarded route target.
export default function GamePage() {
  const { roomId } = useParams();
  const { state } = useLocation();

  return (
    <main className="page">
      <h1>Game</h1>
      <p>Room: {roomId}</p>
      {state?.roomCode && <p>Your room code is: {state.roomCode}</p>}
      <p className="page-placeholder">The board, tokens, and dice live here — coming soon.</p>
    </main>
  );
}
