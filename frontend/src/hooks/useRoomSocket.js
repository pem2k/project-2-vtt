import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { connectSocket, joinRoomChannel } from '../lib/socket.js';

/**
 * Hook to manage Socket.IO connection and join room channel (#9).
 * NOTE: The full socket provider and cleanup refactor in #32 will supersede this hook.
 *
 * @param {string} roomId
 * @returns {{ socket: import('socket.io-client').Socket|null, isReady: boolean, error: string|null }}
 */
export function useRoomSocket(roomId) {
  const [socket, setSocket] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let localSocket = null;

    if (!roomId) {
      return;
    }

    async function initSocket() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        localSocket = connectSocket(session?.access_token);
        setSocket(localSocket);

        const join = async () => {
          try {
            await joinRoomChannel(localSocket, roomId);
            if (isMounted) {
              setIsReady(true);
              setError(null);
            }
          } catch (joinErr) {
            if (isMounted) {
              setError(joinErr.message || 'Failed to join room channel.');
            }
          }
        };

        if (localSocket.connected) {
          await join();
        } else {
          localSocket.once('connect', () => {
            if (isMounted) {
              join();
            }
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to initialize socket.');
        }
      }
    }

    initSocket();

    return () => {
      isMounted = false;
      if (localSocket) {
        localSocket.disconnect();
      }
      setSocket(null);
      setIsReady(false);
    };
  }, [roomId]);

  return { socket, isReady, error };
}
