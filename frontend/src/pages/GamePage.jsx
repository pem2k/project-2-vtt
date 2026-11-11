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
  moveToken,
  emitMoveToken,
  upsertToken,
  removeTokenById,
  reconcileTokens,
} from '../lib/tokens.js';
import { appendRoll, emitRollDice } from '../lib/dice.js';
import { createCharacter, getMyCharacter, getRoomCharacters } from '../lib/characters.js';
import { useRoomSocket } from '../hooks/useRoomSocket.js';
import DicePanel from '../components/DicePanel.jsx';
import DMControls from '../components/DMControls.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
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

/**
 * DM card to show after a character list load.
 * Keeps the current selection when that row is still present, otherwise the
 * DM's own card, otherwise the first row.
 * @param {Array} roomCharacters
 * @param {string} userId
 * @param {string|null|undefined} selectedId
 * @returns {object|null}
 */
function chooseVisibleCharacter(roomCharacters, userId, selectedId) {
  const selected = roomCharacters.find((item) => item.id === selectedId) ?? null;
  if (selected) {
    return selected;
  }
  return roomCharacters.find((item) => item.user_id === userId) ?? roomCharacters[0] ?? null;
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [gridCellSize, setGridCellSize] = useState(50);
  const [tokens, setTokens] = useState([]);
  const [visitState, setVisitState] = useState(() => ({
    roomId,
    visitId: 1,
    pendingTokenIds: new Set(),
  }));

  if (visitState.roomId !== roomId) {
    setVisitState({
      roomId,
      visitId: visitState.visitId + 1,
      pendingTokenIds: new Set(),
    });
  }

  const pendingTokenIds = visitState.pendingTokenIds;
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

  const tokensRef = useRef(tokens);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const pendingMovesRef = useRef(new Map());
  const moveOpCounterRef = useRef(0);
  const roomVisitRef = useRef(1);
  const roomIdRef = useRef(roomId);

  useEffect(() => {
    roomIdRef.current = roomId;
    roomVisitRef.current = visitState.visitId;
    pendingMovesRef.current.clear();
  }, [roomId, visitState.visitId]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const currentUserRef = useRef(null);
  const isDMRef = useRef(false);
  const selectedCharacterIdRef = useRef(null);
  const characterReadyRef = useRef(false);
  const characterRequestRef = useRef(0);

  // Initial room load and a later join share this read. A join that already
  // has a card on screen does not flash "Loading character..." or clear it.
  const loadCharacters = useCallback(async () => {
    if (!isMountedRef.current || roomIdRef.current !== roomId) {
      return;
    }

    const user = currentUserRef.current;
    if (!user) {
      return;
    }

    const requestId = ++characterRequestRef.current;
    const reportError = !characterReadyRef.current;
    const dm = isDMRef.current;

    const stillCurrent = () =>
      isMountedRef.current &&
      roomIdRef.current === roomId &&
      characterRequestRef.current === requestId;

    try {
      if (dm) {
        const roomCharacters = await getRoomCharacters(supabase, roomId);
        if (!stillCurrent()) return;
        const next = chooseVisibleCharacter(
          roomCharacters,
          user.id,
          selectedCharacterIdRef.current,
        );
        selectedCharacterIdRef.current = next?.id ?? null;
        setCharacters(roomCharacters);
        setCharacter(next);
      } else {
        const mine = await getMyCharacter(supabase, roomId, user.id);
        if (!stillCurrent()) return;
        selectedCharacterIdRef.current = mine?.id ?? null;
        setCharacter(mine);
        setCharacters([]);
      }

      if (!stillCurrent()) return;
      characterReadyRef.current = true;
      setCharacterReady(true);
      setCharacterError(null);
    } catch (characterErr) {
      if (!stillCurrent()) return;
      // Code only: database messages often include row ids.
      console.error('Failed to load characters.', characterErr?.code ?? '');
      if (!reportError) return;
      selectedCharacterIdRef.current = null;
      characterReadyRef.current = false;
      setCharacter(null);
      setCharacters([]);
      setCharacterReady(false);
      setCharacterError('Unable to load characters.');
    }
  }, [roomId]);

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

  const handleJoined = useCallback(() => {
    return Promise.all([loadRoomState(), loadCharacters()]);
  }, [loadRoomState, loadCharacters]);

  const {
    socket,
    isReady: isSocketReady,
    error: socketError,
  } = useRoomSocket(roomId, {
    onJoined: handleJoined,
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
      characterReadyRef.current = false;
      selectedCharacterIdRef.current = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!isMounted || roomIdRef.current !== roomId) return;
        if (!user) {
          currentUserRef.current = null;
          return;
        }
        setCurrentUser(user);
        currentUserRef.current = user;

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
        isDMRef.current = isRoomDM;
        if (isMounted) {
          setIsDM(isRoomDM);
        }

        try {
          await loadCharacters();
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
  }, [roomId, loadRoomState, loadCharacters]);

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

    const handleRemoteTokenMoved = (token) => {
      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({ type: 'tokenMoved', token });
      }
      setTokens((prev) => {
        const next = upsertToken(prev, token);
        tokensRef.current = next;
        return next;
      });
    };

    socket.on('tokenAdded', handleRemoteTokenAdded);
    socket.on('tokenRemoved', handleRemoteTokenRemoved);
    socket.on('tokenUpdated', handleRemoteTokenUpdated);
    socket.on('tokenMoved', handleRemoteTokenMoved);

    return () => {
      socket.off('tokenAdded', handleRemoteTokenAdded);
      socket.off('tokenRemoved', handleRemoteTokenRemoved);
      socket.off('tokenUpdated', handleRemoteTokenUpdated);
      socket.off('tokenMoved', handleRemoteTokenMoved);
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
    selectedCharacterIdRef.current = next?.id ?? null;
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
      selectedCharacterIdRef.current = created?.id ?? null;
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

  const handleMoveToken = async (token, newX, newY, revert) => {
    if (!token?.id) return;
    const initiatingRoomId = roomId;
    const initiatingVisitId = roomVisitRef.current;

    if (pendingMovesRef.current.has(token.id)) {
      return;
    }

    const opId = ++moveOpCounterRef.current;
    pendingMovesRef.current.set(token.id, { visitId: initiatingVisitId, opId });
    setVisitState((prev) => {
      if (prev.roomId !== initiatingRoomId || prev.visitId !== initiatingVisitId) return prev;
      const nextIds = new Set(prev.pendingTokenIds);
      nextIds.add(token.id);
      return { ...prev, pendingTokenIds: nextIds };
    });

    const isCurrentOp = () =>
      isMountedRef.current &&
      roomIdRef.current === initiatingRoomId &&
      roomVisitRef.current === initiatingVisitId &&
      pendingMovesRef.current.get(token.id)?.opId === opId;

    const clearPendingOperation = () => {
      pendingMovesRef.current.delete(token.id);
      setVisitState((prev) => {
        if (
          prev.roomId !== initiatingRoomId ||
          prev.visitId !== initiatingVisitId ||
          !prev.pendingTokenIds.has(token.id)
        ) {
          return prev;
        }
        const nextIds = new Set(prev.pendingTokenIds);
        nextIds.delete(token.id);
        return { ...prev, pendingTokenIds: nextIds };
      });
    };

    let updated;
    try {
      setActionError(null);
      updated = await moveToken(supabase, { tokenId: token.id, x: newX, y: newY });
    } catch (err) {
      if (isCurrentOp()) {
        const latest = tokensRef.current?.find((t) => t.id === token.id) || token;
        revert?.(latest);
        setActionError(err.message || 'Failed to move token.');
        clearPendingOperation();
      }
      return;
    }

    if (!isCurrentOp()) {
      return;
    }

    if (syncStateRef.current.inFlight) {
      syncStateRef.current.bufferedEvents.push({ type: 'tokenMoved', token: updated });
    }
    setTokens((prev) => {
      const next = upsertToken(prev, updated);
      tokensRef.current = next;
      return next;
    });

    clearPendingOperation();

    try {
      await emitMoveToken(socket, { roomId: initiatingRoomId, tokenId: token.id });
    } catch (syncErr) {
      if (
        !isMountedRef.current ||
        roomIdRef.current !== initiatingRoomId ||
        roomVisitRef.current !== initiatingVisitId
      ) {
        return;
      }
      console.warn('Socket tokenMoved sync failed:', syncErr);
      setActionError('Token position saved, but failed to sync move with other players.');
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
        <button
          type="button"
          className="game-settings-button"
          aria-label={isSettingsOpen ? 'Close settings' : 'Open settings'}
          aria-expanded={isSettingsOpen}
          onClick={() => setIsSettingsOpen((open) => !open)}
        >
          Settings
        </button>
      </header>

      {/* Main Layout: board in the center, chat and dice on the right */}
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
                currentUserId={currentUser?.id}
                isDm={isDM}
                isSocketReady={isSocketReady}
                pendingTokenIds={pendingTokenIds}
                onMoveToken={handleMoveToken}
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

      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}>
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
      </SettingsPanel>

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
