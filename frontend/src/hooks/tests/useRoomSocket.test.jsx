import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useRoomSocket } from '../useRoomSocket.js';
import * as socketLib from '../../lib/socket.js';
import { supabase } from '../../lib/supabaseClient.js';
import { deferred } from '../../test/deferred.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useRoomSocket hook', () => {
  let container;
  let root;
  let eventListeners;
  let mockSocket;
  let authListener;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    eventListeners = {};
    mockSocket = {
      connected: false,
      auth: { accessToken: 'fake-jwt' },
      on: vi.fn((event, handler) => {
        eventListeners[event] = handler;
      }),
      off: vi.fn((event) => {
        delete eventListeners[event];
      }),
      emit: vi.fn(),
      connect: vi.fn(() => {
        mockSocket.connected = true;
      }),
      disconnect: vi.fn(() => {
        mockSocket.connected = false;
      }),
    };

    authListener = null;
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'fake-jwt' } },
      error: null,
    });

    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((callback) => {
      authListener = callback;
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });

    vi.spyOn(socketLib, 'connectSocket').mockReturnValue(mockSocket);
    vi.spyOn(socketLib, 'joinRoomChannel').mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it('connects to socket, joins room channel, and sets isReady to true', async () => {
    let latest = {};
    const onJoinedSpy = vi.fn();

    function TestComponent() {
      const res = useRoomSocket('room-123', { onJoined: onJoinedSpy });
      useEffect(() => {
        latest = res;
      }, [res]);
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(latest.socket).toBe(mockSocket);
    expect(latest.isReady).toBe(false);

    // Simulate socket connection
    mockSocket.connected = true;
    await act(async () => {
      eventListeners['connect']?.();
    });

    expect(socketLib.joinRoomChannel).toHaveBeenCalledWith(
      mockSocket,
      'room-123',
      expect.objectContaining({ timeout: 5000 }),
    );
    expect(latest.isReady).toBe(true);
    expect(latest.error).toBeNull();
    expect(onJoinedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        socket: mockSocket,
        roomId: 'room-123',
      }),
    );
  });

  it('invalidates interrupted joins on disconnect and prevents delayed acks from setting readiness', async () => {
    let latest = {};
    const onJoinedSpy = vi.fn();

    const firstJoin = deferred();

    vi.spyOn(socketLib, 'joinRoomChannel')
      .mockImplementationOnce(() => firstJoin.promise)
      .mockResolvedValueOnce({ ok: true });

    function TestComponent() {
      const res = useRoomSocket('room-123', { onJoined: onJoinedSpy });
      useEffect(() => {
        latest = res;
      }, [res]);
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // 1. First connection starts join
    mockSocket.connected = true;
    await act(async () => {
      eventListeners['connect']?.();
    });

    expect(socketLib.joinRoomChannel).toHaveBeenCalledTimes(1);
    expect(latest.isReady).toBe(false);

    // 2. Disconnect occurs before first join resolves
    await act(async () => {
      mockSocket.connected = false;
      eventListeners['disconnect']?.();
    });

    expect(latest.isReady).toBe(false);

    // 3. Delayed acknowledgement from first connection arrives after disconnect
    await act(async () => {
      firstJoin.resolve({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Old delayed ack must NOT set isReady to true or trigger onJoined
    expect(latest.isReady).toBe(false);
    expect(onJoinedSpy).not.toHaveBeenCalled();

    // 4. New connection connects and attempts its own join
    await act(async () => {
      mockSocket.connected = true;
      eventListeners['connect']?.();
    });

    expect(socketLib.joinRoomChannel).toHaveBeenCalledTimes(2);
    expect(latest.isReady).toBe(true);
    expect(onJoinedSpy).toHaveBeenCalledTimes(1);
  });

  it('reconnects with new credentials when access token changes, avoiding reconnect when unchanged', async () => {
    function TestComponent() {
      useRoomSocket('room-123');
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(mockSocket.auth.accessToken).toBe('fake-jwt');
    const disconnectCountBefore = mockSocket.disconnect.mock.calls.length;
    const connectCountBefore = mockSocket.connect.mock.calls.length;

    // 1. Auth state change with UNCHANGED token -> must NOT reconnect
    await act(async () => {
      authListener?.('TOKEN_REFRESHED', { access_token: 'fake-jwt' });
    });

    expect(mockSocket.disconnect.mock.calls.length).toBe(disconnectCountBefore);
    expect(mockSocket.connect.mock.calls.length).toBe(connectCountBefore);

    // 2. Auth state change with NEW token -> must reconnect with new credentials
    await act(async () => {
      authListener?.('TOKEN_REFRESHED', { access_token: 'new-jwt-token' });
    });

    expect(mockSocket.auth.accessToken).toBe('new-jwt-token');
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(mockSocket.connect).toHaveBeenCalled();
  });

  it('cancels authentication recovery if hook unmounts while awaiting getSession', async () => {
    const sessionDeferred = deferred();

    function TestComponent() {
      useRoomSocket('room-123');
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Mock getSession to return a pending promise during error recovery
    vi.spyOn(supabase.auth, 'getSession').mockImplementation(() => sessionDeferred.promise);

    // Trigger connect_error auth failure
    await act(async () => {
      eventListeners['connect_error']?.(new Error('Invalid access token.'));
    });

    const connectCallsBefore = mockSocket.connect.mock.calls.length;

    // Component unmounts while getSession is still in-flight
    await act(async () => {
      root.unmount();
      root = null;
    });

    // Session resolution completes after unmount
    await act(async () => {
      sessionDeferred.resolve({
        data: { session: { access_token: 'newer-token' } },
        error: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Verify connect() was NOT invoked after leaving
    expect(mockSocket.connect.mock.calls.length).toBe(connectCallsBefore);
  });

  it('stops reconnect loop on authentication failure when token cannot be refreshed', async () => {
    let latest = {};

    function TestComponent() {
      const res = useRoomSocket('room-123');
      useEffect(() => {
        latest = res;
      }, [res]);
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'fake-jwt' } },
      error: null,
    });

    await act(async () => {
      await eventListeners['connect_error']?.(new Error('Invalid access token.'));
    });

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(latest.isReady).toBe(false);
    expect(latest.error).toContain('Invalid access token.');
  });

  it('prevents superseded authentication recovery from disconnecting a newly refreshed connection', async () => {
    let latest = {};

    function TestComponent() {
      const res = useRoomSocket('room-123');
      useEffect(() => {
        latest = res;
      }, [res]);
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // 1. connect_error occurs while getSession is paused on deferred
    const pausedRecovery = deferred();
    vi.spyOn(supabase.auth, 'getSession').mockImplementation(() => pausedRecovery.promise);

    act(() => {
      eventListeners['connect_error']?.(new Error('Invalid access token.'));
    });

    // 2. While recovery is paused, auth state changes with a refreshed token
    await act(async () => {
      authListener?.('TOKEN_REFRESHED', { access_token: 'refreshed-jwt' });
    });

    // Simulate successful reconnection & room join on refreshed credentials
    await act(async () => {
      mockSocket.connected = true;
      await eventListeners['connect']?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Verify healthy connection is now ready and has no error
    expect(mockSocket.connected).toBe(true);
    expect(latest.isReady).toBe(true);
    expect(latest.error).toBeNull();

    const disconnectCallsAfterConnect = mockSocket.disconnect.mock.calls.length;

    // 3. Now resolve the old paused recovery
    await act(async () => {
      pausedRecovery.resolve({
        data: { session: { access_token: 'refreshed-jwt' } },
        error: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // 4. Assert that the healthy connection remains connected and ready, with no stale error or extra disconnect
    expect(mockSocket.connected).toBe(true);
    expect(latest.isReady).toBe(true);
    expect(latest.error).toBeNull();
    expect(mockSocket.disconnect.mock.calls.length).toBe(disconnectCallsAfterConnect);
  });

  it('handles room-join rejection and exposes useful error', async () => {
    vi.spyOn(socketLib, 'joinRoomChannel').mockRejectedValue(
      new Error('Access denied: not a member of this room'),
    );

    let latest = {};

    function TestComponent() {
      const res = useRoomSocket('room-123');
      useEffect(() => {
        latest = res;
      }, [res]);
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockSocket.connected = true;
      await eventListeners['connect']?.();
    });

    expect(latest.isReady).toBe(false);
    expect(latest.error).toBe('Access denied: not a member of this room');
  });

  it('handles room-join timeout and exposes timeout error', async () => {
    vi.spyOn(socketLib, 'joinRoomChannel').mockRejectedValue(
      new Error('Timed out waiting to join room channel.'),
    );

    let latest = {};

    function TestComponent() {
      const res = useRoomSocket('room-123');
      useEffect(() => {
        latest = res;
      }, [res]);
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockSocket.connected = true;
      await eventListeners['connect']?.();
    });

    expect(latest.isReady).toBe(false);
    expect(latest.error).toBe('Timed out waiting to join room channel.');
  });

  it('removes listeners, unsubscribes auth, and disconnects on unmount', async () => {
    let unmounted = false;
    let authUnsubscribeSpy = vi.fn();

    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation(() => ({
      data: {
        subscription: {
          unsubscribe: authUnsubscribeSpy,
        },
      },
    }));

    function TestComponent() {
      useRoomSocket('room-123');
      return null;
    }

    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await act(async () => {
      root.unmount();
      unmounted = true;
    });

    expect(unmounted).toBe(true);
    expect(authUnsubscribeSpy).toHaveBeenCalled();
    expect(mockSocket.off).toHaveBeenCalledWith('connect');
    expect(mockSocket.off).toHaveBeenCalledWith('disconnect');
    expect(mockSocket.off).toHaveBeenCalledWith('connect_error');
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
