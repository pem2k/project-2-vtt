import { describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useRoomSocket } from './useRoomSocket.js';
import * as socketLib from '../lib/socket.js';
import { supabase } from '../lib/supabaseClient.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useRoomSocket hook', () => {
  it('connects to socket and joins room channel', async () => {
    const mockSocket = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'fake-jwt' } },
      error: null,
    });

    vi.spyOn(socketLib, 'connectSocket').mockReturnValue(mockSocket);
    vi.spyOn(socketLib, 'joinRoomChannel').mockResolvedValue({ ok: true });

    let latest = {};
    function TestComponent() {
      const res = useRoomSocket('room-123');
      useEffect(() => {
        latest = res;
      }, [res]);
      return null;
    }

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TestComponent />);
    });

    // Wait a tick for async session resolution
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(latest.isReady).toBe(true);
    expect(latest.socket).toBe(mockSocket);

    await act(async () => {
      root.unmount();
    });

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
