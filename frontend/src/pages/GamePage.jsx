import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { getActiveMap, emitMapUpdated } from '../lib/maps.js';
import { getRoomMembers, getRoomName } from '../lib/rooms.js';
import { getRoomGrid, setRoomGrid, emitGridUpdated } from '../lib/roomGrid.js';
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
import {
  createCharacter,
  getMyCharacter,
  getRoomCharacters,
  updateCharacterHp,
  upsertCharacter,
  reconcileCharacters,
  emitCharacterUpdated,
} from '../lib/characters.js';
import { useRoomSocket } from '../hooks/useRoomSocket.js';
import DicePanel from '../components/DicePanel.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import Board from '../components/board/Board.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [gridCellSize, setGridCellSize] = useState(50);
  const [gridSavingVisit, setGridSavingVisit] = useState(null);
  const savedGridRef = useRef({ grid_visible: true, grid_cell_size: 50 });
  const gridSaveRef = useRef(null);
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
  const gridSaving = gridSavingVisit === visitState.visitId;
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
    mapOverride: undefined,
    gridOverride: null,
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
    gridSaveRef.current = null;
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
        const reconciled = reconcileCharacters(roomCharacters, syncStateRef.current.bufferedEvents);
        const next = chooseVisibleCharacter(reconciled, user.id, selectedCharacterIdRef.current);
        selectedCharacterIdRef.current = next?.id ?? null;
        setCharacters(reconciled);
        setCharacter(next);
      } else {
        let mine = await getMyCharacter(supabase, roomId, user.id);
        if (!stillCurrent()) return;
        const bufferedUpdate = [...syncStateRef.current.bufferedEvents]
          .reverse()
          .find((ev) => ev.type === 'characterUpdated' && ev.character?.user_id === user.id);
        if (bufferedUpdate?.character) {
          mine = bufferedUpdate.character;
        }
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

  const applyRoomGrid = useCallback((grid) => {
    savedGridRef.current = grid;
    setShowGrid(grid.grid_visible);
    setGridCellSize(grid.grid_cell_size);
    if (syncStateRef.current.inFlight) syncStateRef.current.gridOverride = grid;
  }, []);

  const loadRoomState = useCallback(async () => {
    if (!isMountedRef.current || roomIdRef.current !== roomId) {
      return;
    }

    const currentSyncId = ++syncStateRef.current.syncId;
    syncStateRef.current.inFlight = true;
    syncStateRef.current.bufferedEvents = [];
    syncStateRef.current.mapOverride = undefined;
    syncStateRef.current.gridOverride = null;

    try {
      const [snapshotTokens, snapshotMap, snapshotGrid] = await Promise.all([
        getRoomTokens(supabase, roomId),
        getActiveMap(supabase, roomId),
        getRoomGrid(supabase, roomId),
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
      applyRoomGrid(syncStateRef.current.gridOverride ?? snapshotGrid);

      if (syncStateRef.current.mapOverride !== undefined) {
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
        syncStateRef.current.mapOverride = undefined;
        syncStateRef.current.gridOverride = null;
      }
    }
  }, [roomId, applyRoomGrid]);

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

  useEffect(() => {
    if (!socket) return;
    const handleGridUpdated = (grid) => {
      if (grid.id === roomId) applyRoomGrid(grid);
    };
    socket.on('gridUpdated', handleGridUpdated);
    const handleMapUpdated = ({ roomId: updatedRoomId, map }) => {
      if (updatedRoomId !== roomId) return;
      if (syncStateRef.current.inFlight) syncStateRef.current.mapOverride = map;
      setActiveMap(map);
    };
    socket.on('mapUpdated', handleMapUpdated);
    return () => {
      socket.off('gridUpdated', handleGridUpdated);
      socket.off('mapUpdated', handleMapUpdated);
    };
  }, [socket, roomId, applyRoomGrid]);

  async function saveGrid(visible, cellSize) {
    if (!isDM || gridSaveRef.current || !isSocketReady) return;
    if (
      visible === savedGridRef.current.grid_visible &&
      cellSize === savedGridRef.current.grid_cell_size
    )
      return;
    const operation = {};
    const visit = roomVisitRef.current;
    const stillCurrent = () =>
      isMountedRef.current && roomIdRef.current === roomId && roomVisitRef.current === visit;
    gridSaveRef.current = operation;
    setGridSavingVisit(visit);
    setActionError(null);
    try {
      let saved;
      try {
        saved = await setRoomGrid(supabase, { roomId, visible, cellSize });
      } catch {
        if (stillCurrent()) {
          applyRoomGrid(savedGridRef.current);
          setActionError('Unable to save grid settings.');
        }
        return;
      }
      if (!stillCurrent()) return;
      applyRoomGrid(saved);
      try {
        await emitGridUpdated(socket, roomId);
      } catch {
        if (stillCurrent()) setActionError('Grid saved, but could not sync to other players.');
      }
    } finally {
      if (gridSaveRef.current === operation) {
        gridSaveRef.current = null;
        if (stillCurrent()) setGridSavingVisit(null);
      }
    }
  }

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

  // Subscribe to real-time character updates broadcast by room members (#14)
  useEffect(() => {
    if (!socket) return;

    const handleRemoteCharacterUpdated = (characterRow) => {
      if (!characterRow || characterRow.room_id !== roomIdRef.current) return;

      if (syncStateRef.current.inFlight) {
        syncStateRef.current.bufferedEvents.push({
          type: 'characterUpdated',
          character: characterRow,
        });
      }

      const dm = isDMRef.current;
      const currentUserId = currentUserRef.current?.id;

      if (dm) {
        setCharacters((prev) => upsertCharacter(prev, characterRow));
        if (selectedCharacterIdRef.current === characterRow.id) {
          setCharacter(characterRow);
        } else if (!selectedCharacterIdRef.current) {
          selectedCharacterIdRef.current = characterRow.id;
          setCharacter(characterRow);
        }
      } else {
        if (characterRow.user_id === currentUserId) {
          selectedCharacterIdRef.current = characterRow.id;
          setCharacter(characterRow);
        }
      }
    };

    socket.on('characterUpdated', handleRemoteCharacterUpdated);

    return () => {
      socket.off('characterUpdated', handleRemoteCharacterUpdated);
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

  const handleRoll = (notationOrDie) => {
    if (!socket) return;
    emitRollDice(socket, roomId, notationOrDie);
  };

  const handleSelectCharacter = (next) => {
    selectedCharacterIdRef.current = next?.id ?? null;
    setCharacter(next);
    setCharacterError(null);
  };

  const handleCreateCharacter = async ({ name, maxHp, ac }) => {
    if (!currentUser) {
      throw new Error('Unable to create character.');
    }

    const initiatingRoomId = roomId;
    const initiatingVisitId = roomVisitRef.current;
    characterRequestRef.current++;

    let created;
    try {
      setActionError(null);
      created = await createCharacter(supabase, {
        roomId: initiatingRoomId,
        userId: currentUser.id,
        name,
        maxHp,
        ac,
      });
    } catch (err) {
      console.error('Failed to create character.', err?.code ?? '');
      throw err;
    }

    if (
      !isMountedRef.current ||
      roomIdRef.current !== initiatingRoomId ||
      roomVisitRef.current !== initiatingVisitId
    ) {
      return created;
    }

    if (syncStateRef.current.inFlight) {
      syncStateRef.current.bufferedEvents.push({
        type: 'characterUpdated',
        character: created,
      });
    }

    selectedCharacterIdRef.current = created?.id ?? null;
    setCharacter(created);
    setCharacters((prev) => upsertCharacter(prev, created));
    setCharacterError(null);

    try {
      await emitCharacterUpdated(socket, {
        roomId: initiatingRoomId,
        characterId: created.id,
      });
    } catch (syncErr) {
      if (
        !isMountedRef.current ||
        roomIdRef.current !== initiatingRoomId ||
        roomVisitRef.current !== initiatingVisitId
      ) {
        return created;
      }
      console.warn('Socket characterUpdated sync failed:', syncErr);
      setActionError('Character created, but failed to sync with other players.');
    }

    return created;
  };

  const handleUpdateHp = async (characterId, newHp) => {
    const initiatingRoomId = roomId;
    const initiatingVisitId = roomVisitRef.current;

    let updated;
    try {
      setActionError(null);
      updated = await updateCharacterHp(supabase, {
        characterId,
        hp: newHp,
        isDM: isDMRef.current,
      });
    } catch (err) {
      console.error('Failed to update character HP.', err?.code ?? '');
      throw err;
    }

    if (
      !isMountedRef.current ||
      roomIdRef.current !== initiatingRoomId ||
      roomVisitRef.current !== initiatingVisitId
    ) {
      return updated;
    }

    if (syncStateRef.current.inFlight) {
      syncStateRef.current.bufferedEvents.push({
        type: 'characterUpdated',
        character: updated,
      });
    }

    setCharacters((prev) => upsertCharacter(prev, updated));
    if (selectedCharacterIdRef.current === updated.id) {
      setCharacter(updated);
    }

    try {
      await emitCharacterUpdated(socket, {
        roomId: initiatingRoomId,
        characterId: updated.id,
      });
    } catch (syncErr) {
      if (
        !isMountedRef.current ||
        roomIdRef.current !== initiatingRoomId ||
        roomVisitRef.current !== initiatingVisitId
      ) {
        return updated;
      }
      console.warn('Socket characterUpdated sync failed:', syncErr);
      setActionError('Character HP saved, but failed to sync update with other players.');
    }

    return updated;
  };

  const handleSelectActiveMap = async (mapRecord) => {
    const visit = visitState.visitId;
    const stillCurrent = () =>
      isMountedRef.current && roomIdRef.current === roomId && roomVisitRef.current === visit;
    if (!stillCurrent()) return;
    if (syncStateRef.current.inFlight) {
      syncStateRef.current.mapOverride = mapRecord;
    }
    setActiveMap(mapRecord);
    setActionError(null);
    try {
      await emitMapUpdated(socket, roomId);
    } catch {
      if (stillCurrent()) setActionError('Map saved, but could not sync to other players.');
    }
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
      </header>

      {/* Main Layout: Board across available space, chat and dice on the right (#55) */}
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

        {/* Right column: chat (settings button included) above the dice roller */}
        <div className="game-right-column">
          <ChatPanel
            currentUser={currentUser}
            isDM={isDM}
            isSettingsOpen={isSettingsOpen}
            onToggleSettings={() => setIsSettingsOpen((prev) => !prev)}
            rolls={rolls}
            onRoll={handleRoll}
          />
          <DicePanel onRoll={handleRoll} disabled={!socket?.connected} />
        </div>
      </div>

      {/* Floating Settings Panel (Character tab for players; Character, Users, Maps, Tokens for DMs) */}
      <SettingsPanel
        key={roomId}
        isDM={isDM}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        character={character}
        characters={characters}
        onCreateCharacter={handleCreateCharacter}
        onSelectCharacter={handleSelectCharacter}
        onUpdateCharacterHp={handleUpdateHp}
        characterLoading={characterLoading}
        characterError={characterError}
        characterReady={characterReady}
        supabase={supabase}
        roomId={roomId}
        activeMapId={activeMap?.id}
        onSelectActiveMap={handleSelectActiveMap}
        showGrid={showGrid}
        onToggleGrid={() => saveGrid(!showGrid, gridCellSize)}
        gridCellSize={gridCellSize}
        onChangeGridCellSize={setGridCellSize}
        onCommitGridCellSize={(size) => saveGrid(showGrid, size)}
        gridDisabled={loading || gridSaving || !isSocketReady}
        tokens={tokens}
        members={members}
        onAddToken={handleAddToken}
        onRemoveToken={handleRemoveToken}
        onAssignToken={handleAssignToken}
        onRefreshMembers={refreshMembers}
      />
    </div>
  );
}
