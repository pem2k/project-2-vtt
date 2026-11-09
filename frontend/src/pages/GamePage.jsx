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
import { createCharacter, getMyCharacter, getRoomCharacters } from '../lib/characters.js';
import { useRoomSocket } from '../hooks/useRoomSocket.js';
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
  const [character, setCharacter] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [characterError, setCharacterError] = useState(null);
  const [characterLoading, setCharacterLoading] = useState(true);
  const [characterReady, setCharacterReady] = useState(false);

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
      setCharacterLoading(true);
      setCharacterReady(false);
      setCharacterError(null);
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
          setCharacterLoading(false);
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

      {/* Main Layout: Character card on the left, board in the center, chat on the right */}
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
