import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerJoinRoom, registerSocketAuth } from '../src/sockets/roomSocket.js';

describe('room socket authentication', () => {
  it('rejects a socket when Supabase cannot verify its access token', async () => {
    const io = { use: vi.fn() };
    const createSupabaseClient = vi.fn(() => ({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('invalid') }) },
    }));
    registerSocketAuth(io, { createSupabaseClient });
    const middleware = io.use.mock.calls[0][0];
    const next = vi.fn();

    await middleware({ handshake: { auth: { accessToken: 'bad-token' } } }, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('room socket joining', () => {
  it('joins an authenticated member to a room and acknowledges success', async () => {
    const socket = new EventEmitter();
    socket.user = { id: 'user-123' };
    socket.join = vi.fn().mockResolvedValue(undefined);
    const io = new EventEmitter();
    const maybeSingle = vi.fn().mockResolvedValue({ data: { room_id: 'room-123' }, error: null });
    const membershipClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle })),
          })),
        })),
      })),
    };

    registerJoinRoom(io, { createMembershipClient: vi.fn(() => membershipClient) });
    io.emit('connection', socket);
    const ack = vi.fn();
    socket.emit('joinRoom', 'room-123', ack);
    await new Promise(setImmediate);

    expect(socket.join).toHaveBeenCalledWith('room-123');
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });
});
