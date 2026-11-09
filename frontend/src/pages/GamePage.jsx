import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  reconcileTokens,
} from '../lib/tokens.js';
import { useRoomSocket } from '../hooks/useRoomSocket.js';
import DMControls from '../components/DMControls.jsx';
import Board from '../components/board/Board.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

export default function GamePage() {
  const { roomId } = useParams();

  const [roomName, setRoomName] = useState('');
  const [roomError, setRoomError] = useState(null);
  const [recoveryError, setRecoveryError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isDM, setIsDM] = useState(false);
  const [activeMap, setActiveMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDMModalOpen, setIsDMModalOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [gridCellSize, setGridCellSize] = useState(50);
  const [tokens, setTokens] = useState([]);
  const [members, setMembers] = useState([]);

  const syncStateRef = useRef({
    syncId: 0,
    inFlight: false,
    bufferedEvents: [],
    mapOverride: null,
  });

  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadRoomState = useCallback(async () => {
    if (!isMountedRef.current || roomIdRef.current !== roomId) {
      return;
    }

    const currentSyncId = ++syncStateRef.current.syncId;
    syncStateRef.current.inFlight = true;
    syncStateRef.current.bufferedEvents = [];
    syncStateRef.current.mapOverride = null;

    try {
      const [snapshotTokens, snapshotMap] = await Promise.all([
        getRoomTokens(supabase, roomId),
        getActiveMap(supabase, roomId),
      ]);

      if (
        !isMountedRef.current ||
        roomIdRef.current !== roomId ||
        syncStateRef.current.syncId !== currentSyncId
      ) {
        return;
      }

      const finalTokens = reconcileTokens(snapshotTokens, syncStateRef.current.bufferedEvents);
      setTokens(finalTokens);

      if (syncStateRef.current.mapOverride !== null) {
        setActiveMap(syncStateRef.current.mapOverride);
      } else {
        setActiveMap(snapshotMap);
      }
      setRecoveryError(null);
    } catch (syncErr) {
      if (
        !isMountedRef.current ||
        roomIdRef.current !== roomId ||
        syncStateRef.current.syncId !== currentSyncId
      ) {
        return;
      }
      setRecoveryError(syncErr.message || 'Failed to load game room state.');
      console.error('Failed to reload authoritative room state:', syncErr);
    } finally {
      if (syncStateRef.current.syncId === currentSyncId) {
        syncStateRef.current.inFlight = false;
        syncStateRef.current.bufferedEvents = [];
        syncStateRef.current.mapOverride = null;
      }
    }
  }, [roomId]);

  const { socket, error: socketError } = useRoomSocket(roomId, {
    onJoined: loadRoomState,
  });

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
      setRoomError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!isMounted || roomIdRef.current !== roomId) return;
        if (!user) return;
        setCurrentUser(user);

        // Room name only: the uuid is internal and never shown
        try {
          const name = await getRoomName(supabase, roomId);
          if (!isMounted || roomIdRef.current !== roomId) return;
          setRoomName(name);
        } catch (loadError) {
          if (!isMounted || roomIdRef.current !== roomId) return;
          setRoomError(loadError.message || 'Unable to load room.');
        }

        if (!isMounted || roomIdRef.current !== roomId) return;

        // Determine user role in this room
        const { data: membership } = await supabase
          .from('room_members')
          .select('role')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted || roomIdRef.current !== roomId) return;

        if (membership?.role === 'dm') {
          setIsDM(true);
        }

        // Fetch room members (#10)
        try {
          const roomMembers = await getRoomMembers(supabase, roomId);
          if (!isMounted || roomIdRef.current !== roomId) return;
          setMembers(roomMembers);
        } catch (memberErr) {
          if (!isMounted || roomIdRef.current !== roomId) return;
          console.error('Failed to load room members:', memberErr);
        }

        if (!isMounted || roomIdRef.current !== roomId) return;

        // Await the initial room snapshot before ending initial loading
        await loadRoomState();
      } catch (err) {
        if (!isMounted || roomIdRef.current !== roomId) return;
        console.error('Error loading game page details:', err);
      } finally {
        if (isMounted && roomIdRef.current === roomId) {
          setLoading(false);
        }
      }
    }

    loadGameDetails();

    return () => {
      isMounted = false;
    };
  }, [roomId, loadRoomState]);

  // Subscribe to real-time token events broadcast by other room members
  useEffect(() => {
    if (!socket) return;

    const handleRemoteTokenAdded = (token) => {
      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({ type: 'tokenAdded', token });
      }
      setTokens((prev) => upsertToken(prev, token));
    };

    const handleRemoteTokenRemoved = ({ id }) => {
      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({ type: 'tokenRemoved', id });
      }
      setTokens((prev) => removeTokenById(prev, id));
    };

    const handleRemoteTokenUpdated = (token) => {
      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({ type: 'tokenUpdated', token });
      }
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
    if (syncStateRef.current.inFlight) {
      syncStateRef.current.mapOverride = mapRecord;
    }
    setActiveMap(mapRecord);
  };

  const handleSelectActiveMap = (mapRecord) => {
    if (syncStateRef.current.inFlight) {
      syncStateRef.current.mapOverride = mapRecord;
    }
    setActiveMap(mapRecord);
  };

  const handleAddToken = async (name, color) => {
    try {
      setActionError(null);
      const created = await addToken(supabase, { roomId, name, color });
      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({ type: 'tokenAdded', token: created });
      }
      setTokens((prev) => upsertToken(prev, created));
      if (socket?.connected) {
        socket.emit('tokenAdded', { roomId, tokenId: created.id }, (response) => {
          if (!response?.ok) {
            console.warn('Socket tokenAdded ack failed:', response?.error);
          }
        });
      }
    } catch (err) {
      setActionError(err.message || 'Failed to add token.');
      throw err;
    }
  };

  const handleRemoveToken = async (token) => {
    try {
      setActionError(null);
      await removeToken(supabase, token.id);
      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({ type: 'tokenRemoved', id: token.id });
      }
      setTokens((prev) => removeTokenById(prev, token.id));
      if (socket?.connected) {
        socket.emit('tokenRemoved', { roomId, tokenId: token.id }, (response) => {
          if (!response?.ok) {
            console.warn('Socket tokenRemoved ack failed:', response?.error);
          }
        });
      }
    } catch (err) {
      setActionError(err.message || 'Failed to remove token.');
      throw err;
    }
  };

  const handleAssignToken = async (token, userId) => {
    try {
      setActionError(null);
      const updated = await assignToken(supabase, { tokenId: token.id, userId });
      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({ type: 'tokenUpdated', token: updated });
      }
      setTokens((prev) => upsertToken(prev, updated));
      if (socket?.connected) {
        socket.emit('tokenUpdated', { roomId, tokenId: token.id }, (response) => {
          if (!response?.ok) {
            console.warn('Socket tokenUpdated ack failed:', response?.error);
          }
        });
      }
    } catch (err) {
      setActionError(err.message || 'Failed to assign token.');
      throw err;
    }
  };

  const displayError = actionError || recoveryError || socketError || roomError;

  return (
    <div className="game-screen">
      {/* Top Header: Room Name */}
      <header className="game-top-bar">
        <h1 className="game-room-name">{roomName}</h1>
        {displayError && (
          <p className="auth-error" role="alert">
            {displayError}
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
