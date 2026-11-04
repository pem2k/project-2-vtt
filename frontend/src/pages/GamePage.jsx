import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { getActiveMap } from '../lib/maps.js';
import { getRoomName } from '../lib/rooms.js';
import DMControls from '../components/DMControls.jsx';
import Board from '../components/board/Board.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

export default function GamePage() {
  const { roomId } = useParams();

  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDM, setIsDM] = useState(false);
  const [activeMap, setActiveMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDMModalOpen, setIsDMModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadGameDetails() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        if (isMounted) setCurrentUser(user);

        // Room name only: the uuid is internal and never shown
        try {
          const name = await getRoomName(supabase, roomId);
          if (isMounted) setRoomName(name);
        } catch (loadError) {
          if (isMounted) setError(loadError.message || 'Unable to load room.');
        }

        // Determine user role in this room
        const { data: membership } = await supabase
          .from('room_members')
          .select('role')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (isMounted && membership?.role === 'dm') {
          setIsDM(true);
        }

        // Fetch active map
        const map = await getActiveMap(supabase, roomId);
        if (isMounted) {
          setActiveMap(map);
        }
      } catch (err) {
        console.error('Error loading game page details:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadGameDetails();

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  const handleMapUploaded = (mapRecord) => {
    setActiveMap(mapRecord);
  };

  const handleSelectActiveMap = (mapRecord) => {
    setActiveMap(mapRecord);
  };

  return (
    <div className="game-screen">
      {/* Top Header: Room Name */}
      <header className="game-top-bar">
        <h1 className="game-room-name">{roomName}</h1>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </header>

      {/* Main Layout: Board in center, Chat with DM tab on right */}
      <div className="game-main-area">
        <main className="game-viewport">
          {loading ? (
            <p className="game-loading-text">Loading game room...</p>
          ) : (
            <div className="game-canvas-wrapper">
              <Board activeMapUrl={activeMap?.url} width={800} height={600} />
            </div>
          )}
        </main>

        {/* Chat panel on the right side with DM Controls toggle tab */}
        <ChatPanel
          currentUser={currentUser}
          isDM={isDM}
          isDMModalOpen={isDMModalOpen}
          onToggleDMControls={() => setIsDMModalOpen((prev) => !prev)}
        />
      </div>

      {/* Floating DM Controls Panel (opens when DM Controls tab is active) */}
      {isDM && (
        <DMControls
          supabase={supabase}
          roomId={roomId}
          activeMapId={activeMap?.id}
          isOpen={isDMModalOpen}
          onClose={() => setIsDMModalOpen(false)}
          onMapUploaded={handleMapUploaded}
          onSelectActiveMap={handleSelectActiveMap}
        />
      )}
    </div>
  );
}
