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
import { appendRoll, emitRollDice } from '../lib/dice.js';
import { createCharacter, getMyCharacter, getRoomCharacters } from '../lib/characters.js';
import { useRoomSocket } from '../hooks/useRoomSocket.js';
import DicePanel from '../components/DicePanel.jsx';
import DMControls from '../components/DMControls.jsx';
import CharacterCard from '../components/CharacterCard.jsx';
import Board from '../components/board/Board.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

const CHARACTER_VALIDATION_ERRORS = new Set([
  'Character name is required.',
  'Character name must be between 1 and 40 characters.',
  'Max HP must be an integer of at least 1.',
  'AC must be an integer of at least 0.',
]);

/**
 * User-facing character errors. Validation copy is safe to repeat.
 * Database failures often embed uuids, so those stay off the page.
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
function toCharacterError(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (CHARACTER_VALIDATION_ERRORS.has(message)) return message;
  if (/already has a character/i.test(message)) {
    return 'You already have a character in this room.';
  }
  if (/not a member of room/i.test(message)) {
    return 'You must be a member of this room to create a character.';
  }
  return fallback;
}

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
  const [rolls, setRolls] = useState([]);
  const [character, setCharacter] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [characterError, setCharacterError] = useState(null);
  const [characterLoading, setCharacterLoading] = useState(true);
  const [characterReady, setCharacterReady] = useState(false);

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
      setCharacterLoading(true);
      setCharacterReady(false);
      setCharacterError(null);
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

        const isRoomDM = membership?.role === 'dm';
        if (isMounted) {
          setIsDM(isRoomDM);
        }

        try {
          if (isRoomDM) {
            const roomCharacters = await getRoomCharacters(supabase, roomId);
            if (isMounted) {
              const own =
                roomCharacters.find((item) => item.user_id === user.id) ??
                roomCharacters[0] ??
                null;
              setCharacters(roomCharacters);
              setCharacter(own);
              setCharacterReady(true);
            }
          } else {
            const mine = await getMyCharacter(supabase, roomId, user.id);
            if (isMounted) {
              setCharacter(mine);
              setCharacters([]);
              setCharacterReady(true);
            }
          }
        } catch (characterErr) {
          console.error('Failed to load characters.', characterErr?.code ?? '');
          if (isMounted) {
            setCharacter(null);
            setCharacters([]);
            setCharacterReady(false);
            setCharacterError('Unable to load characters.');
          }
        } finally {
          if (isMounted) {
            setCharacterLoading(false);
          }
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
          setCharacterLoading(false);
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

  useEffect(() => {
    if (!socket) return;

    const handleDiceResult = (roll) => {
      if (!roll || roll.roomId !== roomId) return;
      setRolls((prev) =>
        appendRoll(prev, {
          ...roll,
          id: crypto.randomUUID(),
          at: Date.now(),
        }),
      );
    };

    socket.on('diceResult', handleDiceResult);
    return () => {
      socket.off('diceResult', handleDiceResult);
    };
  }, [socket, roomId]);

  const handleRoll = (die) => {
    if (!socket?.connected) return;
    emitRollDice(socket, roomId, die);
  };

  const handleSelectCharacter = (next) => {
    setCharacter(next);
    setCharacterError(null);
  };

  const handleCreateCharacter = async ({ name, maxHp, ac }) => {
    if (!currentUser) {
      setCharacterError('Unable to create character.');
      return;
    }

    try {
      const created = await createCharacter(supabase, {
        roomId,
        userId: currentUser.id,
        name,
        maxHp,
        ac,
      });
      setCharacter(created);
      setCharacters((prev) => [...prev, created]);
      setCharacterError(null);
    } catch (err) {
      console.error('Failed to create character.', err?.code ?? '');
      setCharacterError(toCharacterError(err, 'Unable to create character.'));
    }
  };

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

      {/* Main Layout: Character card on the left, board in the center, chat and dice on the right */}
      <div className="game-main-area">
        <aside className="character-sidebar" aria-label="Character card">
          <div className="character-sidebar-header">
            <span className="chat-tab-title">Character</span>
          </div>
          <div className="character-sidebar-body">
            {characterError && (
              <p className="auth-error" role="alert">
                {characterError}
              </p>
            )}
            {characterLoading ? (
              <p className="character-card-loading">Loading character...</p>
            ) : (
              characterReady && (
                <CharacterCard
                  character={character}
                  characters={characters}
                  isDM={isDM}
                  onCreate={handleCreateCharacter}
                  onSelect={handleSelectCharacter}
                />
              )
            )}
          </div>
        </aside>

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

        {/* Right column: chat (DM Controls tab included) above the dice roller */}
        <div className="game-right-column">
          <ChatPanel
            currentUser={currentUser}
            isDM={isDM}
            isDMModalOpen={isDMModalOpen}
            onToggleDMControls={() => setIsDMModalOpen((prev) => !prev)}
            rolls={rolls}
          />
          <DicePanel onRoll={handleRoll} disabled={!socket?.connected} />
        </div>
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
