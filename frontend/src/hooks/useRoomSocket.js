import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { connectSocket, joinRoomChannel } from '../lib/socket.js';

/**
 * Hook to manage Socket.IO connection, room channel subscription, and reconnection.
 *
 * @param {string} roomId
 * @param {object} [options]
 * @param {function} [options.onJoined] - Callback invoked after a room is successfully joined (including reconnects).
 * @returns {{ socket: import('socket.io-client').Socket|null, isReady: boolean, error: string|null }}
 */
export function useRoomSocket(roomId, { onJoined } = {}) {
  const [socket, setSocket] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  const onJoinedRef = useRef(onJoined);
  useEffect(() => {
    onJoinedRef.current = onJoined;
  }, [onJoined]);

  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    let isMounted = true;
    let localSocket = null;
    let authSub = null;
    let activeJoinId = 0;
    let authRecoveryId = 0;
    let currentToken = null;

    if (!roomId) {
      return;
    }

    async function initSocket() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        // Verify still mounted and belongs to the same room after awaiting authentication
        if (!isMounted || roomIdRef.current !== roomId) return;

        if (sessionError || !session?.access_token) {
          setError('Authentication required.');
          return;
        }

        currentToken = session.access_token;
        localSocket = connectSocket(currentToken);
        setSocket(localSocket);

        // Invalidate pending joins on disconnect and attempt a new join per connection
        const performJoin = async (targetSocket) => {
          if (!isMounted || roomIdRef.current !== roomId || !targetSocket?.connected) return;
          const joinId = ++activeJoinId;

          try {
            const response = await joinRoomChannel(targetSocket, roomId, { timeout: 5000 });
            // Verify joinId matches (not invalidated by disconnect), targetSocket still connected, still mounted and same room
            if (
              !isMounted ||
              roomIdRef.current !== roomId ||
              joinId !== activeJoinId ||
              !targetSocket.connected
            ) {
              return;
            }
            setIsReady(true);
            setError(null);
            if (onJoinedRef.current) {
              onJoinedRef.current({ socket: targetSocket, roomId, response });
            }
          } catch (joinErr) {
            if (!isMounted || roomIdRef.current !== roomId || joinId !== activeJoinId) {
              return;
            }
            setIsReady(false);
            setError(joinErr.message || 'Failed to join room channel.');
          }
        };

        const handleConnect = () => {
          if (!isMounted || roomIdRef.current !== roomId) return;
          authRecoveryId++;
          performJoin(localSocket);
        };

        const handleDisconnect = () => {
          if (!isMounted) return;
          activeJoinId++; // Invalidate pending join immediately on disconnect
          authRecoveryId++;
          setIsReady(false);
        };

        const handleConnectError = async (err) => {
          if (!isMounted || roomIdRef.current !== roomId) return;
          activeJoinId++;
          setIsReady(false);

          const isAuthError =
            err?.message?.includes('access token') ||
            err?.message?.includes('Authentication failed') ||
            err?.message?.includes('jwt') ||
            err?.message?.includes('unauthorized');

          if (isAuthError) {
            const recoveryId = ++authRecoveryId;
            try {
              const {
                data: { session: freshSession },
                error: refreshErr,
              } = await supabase.auth.getSession();

              // Verify still mounted, belongs to same room/connection, and recovery not superseded
              if (
                !isMounted ||
                roomIdRef.current !== roomId ||
                !localSocket ||
                recoveryId !== authRecoveryId
              ) {
                return;
              }

              const freshToken = freshSession?.access_token;
              if (!refreshErr && freshToken && freshToken !== currentToken) {
                currentToken = freshToken;
                localSocket.auth = { accessToken: freshToken };
                localSocket.disconnect();
                localSocket.connect();
                return;
              }
            } catch {
              // Ignore refresh error and fall through to disconnect
            }

            if (
              !isMounted ||
              roomIdRef.current !== roomId ||
              !localSocket ||
              recoveryId !== authRecoveryId
            ) {
              return;
            }
            localSocket.disconnect();
            setError(err.message || 'Authentication failed.');
          } else {
            setError(err.message || 'Connection error.');
          }
        };

        localSocket.on('connect', handleConnect);
        localSocket.on('disconnect', handleDisconnect);
        localSocket.on('connect_error', handleConnectError);

        // Reconnect with new credentials and rejoin when access token changes;
        // avoid reconnecting when token is unchanged.
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, newSession) => {
          if (!isMounted || roomIdRef.current !== roomId) return;
          const nextToken = newSession?.access_token;
          if (nextToken && nextToken !== currentToken) {
            authRecoveryId++;
            currentToken = nextToken;
            if (localSocket) {
              localSocket.auth = { accessToken: nextToken };
              activeJoinId++;
              setIsReady(false);
              localSocket.disconnect();
              localSocket.connect();
            }
          }
        });
        authSub = subscription;

        if (localSocket.connected) {
          performJoin(localSocket);
        }
      } catch (err) {
        if (isMounted && roomIdRef.current === roomId) {
          setIsReady(false);
          setError(err.message || 'Failed to initialize socket.');
        }
      }
    }

    initSocket();

    return () => {
      isMounted = false;
      activeJoinId++;
      authRecoveryId++;
      if (authSub) {
        authSub.unsubscribe();
        authSub = null;
      }
      if (localSocket) {
        localSocket.off('connect');
        localSocket.off('disconnect');
        localSocket.off('connect_error');
        localSocket.disconnect();
      }
      setSocket(null);
      setIsReady(false);
    };
  }, [roomId]);

  return { socket, isReady, error };
}
