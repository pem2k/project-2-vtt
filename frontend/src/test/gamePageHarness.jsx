import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import GamePage from '../pages/GamePage.jsx';
import * as mapsLib from '../lib/maps.js';
import * as roomsLib from '../lib/rooms.js';
import { supabase } from '../lib/supabaseClient.js';
import * as useRoomSocketModule from '../hooks/useRoomSocket.js';
import { deferred } from './deferred.js';

export { deferred };

/**
 * Shared test harness for GamePage integration suites.
 * Provides fresh DOM container, React root, routing/navigation,
 * authenticated Supabase fixtures, and Socket.IO lifecycle helpers.
 */
export function createGamePageHarness() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);
  let activeNavigate = null;

  function NavigationWatcher() {
    activeNavigate = useNavigate();
    return null;
  }

  const socketListeners = new Map();
  const onJoinedCallbacks = new Map();

  const mockSocket = {
    connected: true,
    on: vi.fn((event, handler) => {
      socketListeners.set(event, handler);
    }),
    off: vi.fn((event, handler) => {
      if (!handler || socketListeners.get(event) === handler) {
        socketListeners.delete(event);
      }
    }),
    emit: vi.fn(),
  };

  function setupMockRoomSocket({ socket = mockSocket, isReady = true, error = null } = {}) {
    return vi
      .spyOn(useRoomSocketModule, 'useRoomSocket')
      .mockImplementation((roomId, options = {}) => {
        if (typeof options?.onJoined === 'function') {
          onJoinedCallbacks.set(roomId, options.onJoined);
        }
        return { socket, isReady, error };
      });
  }

  function triggerSocket(event, ...args) {
    const handler = socketListeners.get(event);
    if (!handler) {
      throw new Error(`No socket listener registered for event "${event}"`);
    }
    return handler(...args);
  }

  function triggerOnJoined(roomId = 'room-123') {
    const onJoined = onJoinedCallbacks.get(roomId);
    if (!onJoined) {
      throw new Error(`No onJoined callback registered for room "${roomId}"`);
    }
    return onJoined({ socket: mockSocket, roomId });
  }

  function mockAuthenticatedGame({
    userId = 'user-1',
    role = 'player',
    roomName = 'Icewind Dale',
    members = [],
    activeMap = null,
  } = {}) {
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role } }),
    });

    vi.spyOn(roomsLib, 'getRoomName').mockImplementation(async (_sb, rid) => {
      return typeof roomName === 'function' ? roomName(rid) : roomName;
    });
    vi.spyOn(roomsLib, 'getRoomMembers').mockImplementation((_sb, rid) => {
      return typeof members === 'function' ? members(rid) : Promise.resolve(members);
    });
    vi.spyOn(mapsLib, 'getActiveMap').mockImplementation((_sb, rid) => {
      return typeof activeMap === 'function' ? activeMap(rid) : Promise.resolve(activeMap);
    });
  }

  async function render(initialPath = '/game/room-123', extraNode = null) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <NavigationWatcher />
          {extraNode}
          <Routes>
            <Route path="/game/:roomId" element={<GamePage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  async function navigate(to) {
    if (!activeNavigate) {
      throw new Error('Navigation bridge not ready. Call render() first.');
    }
    await act(async () => {
      activeNavigate(to);
    });
  }

  async function cleanup() {
    try {
      if (root) {
        await act(async () => {
          root.unmount();
        });
      }
    } finally {
      root = null;
      if (container?.parentNode) {
        container.parentNode.removeChild(container);
      }
      container = null;
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  }

  return {
    get container() {
      return container;
    },
    get root() {
      return root;
    },
    mockSocket,
    socketListeners,
    onJoinedCallbacks,
    setupMockRoomSocket,
    triggerSocket,
    triggerOnJoined,
    mockAuthenticatedGame,
    render,
    navigate,
    cleanup,
  };
}
