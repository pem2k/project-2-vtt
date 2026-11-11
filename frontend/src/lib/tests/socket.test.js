import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSocket, disconnectSocket, getSocket, joinRoomChannel } from '../socket.js';

describe('socket client utilities', () => {
  afterEach(() => {
    disconnectSocket();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('connectSocket stores activeSocket and disconnectSocket clears it', () => {
    const socket = connectSocket('test-token');
    expect(socket).toBeDefined();
    expect(getSocket()).toBe(socket);

    disconnectSocket();
    expect(getSocket()).toBeNull();
  });

  it('connectSocket disconnects existing socket before creating a new one', () => {
    const firstSocket = connectSocket('token-1');
    const disconnectSpy = vi.spyOn(firstSocket, 'disconnect');

    const secondSocket = connectSocket('token-2');
    expect(disconnectSpy).toHaveBeenCalled();
    expect(secondSocket).not.toBe(firstSocket);
    expect(getSocket()).toBe(secondSocket);
  });

  it('joinRoomChannel resolves on successful server acknowledgement', async () => {
    const mockSocket = {
      emit: vi.fn((event, roomId, ack) => {
        expect(event).toBe('joinRoom');
        expect(roomId).toBe('room-42');
        ack({ ok: true });
      }),
    };

    await expect(joinRoomChannel(mockSocket, 'room-42')).resolves.toEqual({ ok: true });
  });

  it('joinRoomChannel rejects on server rejection', async () => {
    const mockSocket = {
      emit: vi.fn((_event, _roomId, ack) => {
        ack({ ok: false, error: 'Access denied: not a room member' });
      }),
    };

    await expect(joinRoomChannel(mockSocket, 'room-42')).rejects.toThrow(
      'Access denied: not a room member',
    );
  });

  it('joinRoomChannel rejects on acknowledgement timeout', async () => {
    vi.useFakeTimers();
    const mockSocket = {
      emit: vi.fn(), // never calls ack
    };

    const joinPromise = joinRoomChannel(mockSocket, 'room-42', { timeout: 1000 });

    vi.advanceTimersByTime(1001);

    await expect(joinPromise).rejects.toThrow('Timed out waiting to join room channel.');
  });
});
