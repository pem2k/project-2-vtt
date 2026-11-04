import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import { registerJoinRoom, registerSocketAuth } from '../src/sockets/roomSocket.js';

const savedSupabaseUrl = process.env.SUPABASE_URL;
const savedSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;

afterEach(() => {
  if (savedSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = savedSupabaseUrl;
  if (savedSupabaseAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = savedSupabaseAnonKey;
});

describe('room socket authentication', () => {
  it('rejects missing Supabase configuration during server registration', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    const io = { on: vi.fn(), use: vi.fn() };

    expect(() => createServer({ io })).toThrow('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  });

  it('rejects a socket when Supabase cannot verify its access token', async () => {
    const io = { use: vi.fn() };
    const createSupabaseClient = vi.fn(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('invalid') }),
      },
    }));
    registerSocketAuth(io, { createSupabaseClient });
    const middleware = io.use.mock.calls[0][0];
    const next = vi.fn();

    await middleware({ handshake: { auth: { accessToken: 'bad-token' } } }, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects a socket when no access token is provided', async () => {
    const io = { use: vi.fn() };
    const createSupabaseClient = vi.fn();
    registerSocketAuth(io, { createSupabaseClient });
    const middleware = io.use.mock.calls[0][0];
    const next = vi.fn();

    await middleware({ handshake: { auth: {} } }, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(createSupabaseClient).not.toHaveBeenCalled();
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
    await new Promise((resolve) => {
      socket.emit('joinRoom', 'room-123', (response) => {
        ack(response);
        resolve();
      });
    });

    expect(socket.join).toHaveBeenCalledWith('room-123');
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('does not join a room when the user is not a member', async () => {
    const socket = new EventEmitter();
    socket.user = { id: 'user-123' };
    socket.join = vi.fn().mockResolvedValue(undefined);
    const io = new EventEmitter();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
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
    await new Promise((resolve) => {
      socket.emit('joinRoom', 'room-123', (response) => {
        ack(response);
        resolve();
      });
    });

    expect(socket.join).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: expect.any(String) });
  });

  it('logs join failures and sends a generic acknowledgement', async () => {
    const socket = new EventEmitter();
    socket.user = { id: 'user-123' };
    socket.join = vi.fn().mockResolvedValue(undefined);
    const io = new EventEmitter();
    const logger = vi.fn();
    const membershipError = new Error('database details');
    const membershipClient = {
      from: vi.fn(() => {
        throw membershipError;
      }),
    };

    registerJoinRoom(io, {
      createMembershipClient: vi.fn(() => membershipClient),
      logger,
    });
    io.emit('connection', socket);
    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('joinRoom', 'room-123', (response) => {
        ack(response);
        resolve();
      });
    });

    expect(logger).toHaveBeenCalledWith(membershipError);
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Unable to join room.' });
  });
});
