import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { getActiveMap } from '../lib/maps.js';
import { getRoomMembers, getRoomName } from '../lib/rooms.js';
import {
  getRoomTokens,
  addToken,
  removeToken,
  assignToken,
  upsertToken,
  removeTokenById,
} from '../lib/tokens.js';
import { useRoomSocket } from '../hooks/useRoomSocket.js';
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
  const [showGrid, setShowGrid] = useState(true);
  const [gridCellSize, setGridCellSize] = useState(50);
  const [tokens, setTokens] = useState([]);
  const [members, setMembers] = useState([]);

  const { socket } = useRoomSocket(roomId);

  const refreshMembers = useCallback(async () => {
    try {
      const roomMembers = await getRoomMembers(supabase, roomId);
      setMembers(roomMembers);
    } catch (memberErr) {
      console.error('Failed to load room members:', memberErr);
    }
  }, [roomId]);

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

        // Fetch tokens for this room (#9)
        try {
          const loadedTokens = await getRoomTokens(supabase, roomId);
          if (isMounted) {
            setTokens(loadedTokens);
          }
        } catch (tokErr) {
          console.error('Failed to load room tokens:', tokErr);
        }

        // Fetch room members (#10)
        try {
          const roomMembers = await getRoomMembers(supabase, roomId);
          if (isMounted) {
            setMembers(roomMembers);
          }
        } catch (memberErr) {
          console.error('Failed to load room members:', memberErr);
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

  // Subscribe to real-time token events broadcast by other room members
  useEffect(() => {
    if (!socket) return;

    const handleRemoteTokenAdded = (token) => {
      setTokens((prev) => upsertToken(prev, token));
    };

    const handleRemoteTokenRemoved = ({ id }) => {
      setTokens((prev) => removeTokenById(prev, id));
    };

    const handleRemoteTokenUpdated = (token) => {
      setTokens((prev) => upsertToken(prev, token));
    };

    socket.on('tokenAdded', handleRemoteTokenAdded);
    socket.on('tokenRemoved', handleRemoteTokenRemoved);
    socket.on('tokenUpdated', handleRemoteTokenUpdated);

    return () => {
      socket.off('tokenAdded', handleRemoteTokenAdded);
      socket.off('tokenRemoved', handleRemoteTokenRemoved);
      socket.off('tokenUpdated', handleRemoteTokenUpdated);
    };
  }, [socket]);

  const handleMapUploaded = (mapRecord) => {
    setActiveMap(mapRecord);
  };

  const handleSelectActiveMap = (mapRecord) => {
    setActiveMap(mapRecord);
  };

  const handleAddToken = async (name, color) => {
    try {
      const created = await addToken(supabase, { roomId, name, color });
      setTokens((prev) => upsertToken(prev, created));
      if (socket?.connected) {
        socket.emit('tokenAdded', { roomId, tokenId: created.id }, (response) => {
          if (!response?.ok) {
            console.warn('Socket tokenAdded ack failed:', response?.error);
          }
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to add token.');
      throw err;
    }
  };

  const handleRemoveToken = async (token) => {
    try {
      await removeToken(supabase, token.id);
      setTokens((prev) => removeTokenById(prev, token.id));
      if (socket?.connected) {
        socket.emit('tokenRemoved', { roomId, tokenId: token.id }, (response) => {
          if (!response?.ok) {
            console.warn('Socket tokenRemoved ack failed:', response?.error);
          }
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to remove token.');
      throw err;
    }
  };

  const handleAssignToken = async (token, userId) => {
    try {
      const updated = await assignToken(supabase, { tokenId: token.id, userId });
      setTokens((prev) => upsertToken(prev, updated));
      if (socket?.connected) {
        socket.emit('tokenUpdated', { roomId, tokenId: token.id }, (response) => {
          if (!response?.ok) {
            console.warn('Socket tokenUpdated ack failed:', response?.error);
          }
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to assign token.');
      throw err;
    }
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
              <Board
                activeMapUrl={activeMap?.url}
                width={800}
                height={600}
                showGrid={showGrid}
                cellSize={gridCellSize}
                tokens={tokens}
                members={members}
              />
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
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((prev) => !prev)}
          gridCellSize={gridCellSize}
          onChangeGridCellSize={setGridCellSize}
          tokens={tokens}
          members={members}
          onAddToken={handleAddToken}
          onRemoveToken={handleRemoveToken}
          onAssignToken={handleAssignToken}
          onRefreshMembers={refreshMembers}
        />
      )}
    </div>
  );
}
