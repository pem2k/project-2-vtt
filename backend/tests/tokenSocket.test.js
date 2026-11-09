import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerTokenEvents } from '../src/sockets/tokenSocket.js';

function createMockSocket({
  userId = 'user-dm',
  accessToken = 'valid-jwt',
  joinedRooms = ['room-1'],
} = {}) {
  const socket = new EventEmitter();
  socket.user = { id: userId };
  socket.accessToken = accessToken;
  socket.rooms = new Set(joinedRooms);
  const emit = vi.fn();
  socket.to = vi.fn(() => ({ emit }));
  socket._broadcastEmit = emit;
  return socket;
}

function createMockSupabaseClient({
  role = 'dm',
  memberError = null,
  tokenRow = null,
  tokenError = null,
} = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'room_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: role ? { role } : null,
                  error: memberError,
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'tokens') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: tokenRow,
                  error: tokenError,
                }),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      };
    }),
  };
}

describe('token socket events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an invalid payload for tokenAdded and tokenRemoved', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    registerTokenEvents(io);
    io.emit('connection', socket);

    const ack1 = vi.fn();
    socket.emit('tokenAdded', { roomId: '', tokenId: 'token-1' }, ack1);
    expect(ack1).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/invalid payload/i),
    });

    const ack2 = vi.fn();
    socket.emit('tokenRemoved', { roomId: 'room-1', tokenId: null }, ack2);
    expect(ack2).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/invalid payload/i),
    });
  });

  it('rejects when socket has not joined the room', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket({ joinedRooms: [] }); // not in room-1
    registerTokenEvents(io);
    io.emit('connection', socket);

    const ack = vi.fn();
    socket.emit('tokenAdded', { roomId: 'room-1', tokenId: 'token-1' }, ack);
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/not in room/i),
    });
  });

  it('rejects when user is not a DM in the room', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    const memberClient = createMockSupabaseClient({ role: 'player' });

    registerTokenEvents(io, { createUserClient: () => memberClient });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenAdded', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/only dms/i),
    });
  });

  it('tokenAdded: rejects when token is missing from the database', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    const client = createMockSupabaseClient({ role: 'dm', tokenRow: null });

    registerTokenEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenAdded', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/token not found/i),
    });
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('tokenAdded: broadcasts the token DB row to the room and acknowledges success', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket({ accessToken: 'my-bearer-token' });
    const tokenDbRow = {
      id: 'token-1',
      room_id: 'room-1',
      name: 'Goblin Scout',
      color: '#E6194B',
      x: 0,
      y: 0,
    };

    const createUserClient = vi.fn(() =>
      createMockSupabaseClient({ role: 'dm', tokenRow: tokenDbRow }),
    );

    registerTokenEvents(io, { createUserClient });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenAdded', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    // Check user client created with Authorization Bearer header
    expect(createUserClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer my-bearer-token' } },
      }),
    );

    expect(socket.to).toHaveBeenCalledWith('room-1');
    expect(socket._broadcastEmit).toHaveBeenCalledWith('tokenAdded', tokenDbRow);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('tokenRemoved: rejects when token still exists in database', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    const client = createMockSupabaseClient({ role: 'dm', tokenRow: { id: 'token-1' } });

    registerTokenEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenRemoved', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/token still exists/i),
    });
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('tokenRemoved: broadcasts { id } when token row is gone and acknowledges success', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    const client = createMockSupabaseClient({ role: 'dm', tokenRow: null });

    registerTokenEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenRemoved', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(socket.to).toHaveBeenCalledWith('room-1');
    expect(socket._broadcastEmit).toHaveBeenCalledWith('tokenRemoved', { id: 'token-1' });
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('tokenUpdated: rejects when user is not a DM in the room', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    const client = createMockSupabaseClient({ role: 'player' });

    registerTokenEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenUpdated', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/only dms/i),
    });
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('tokenUpdated: rejects when token is missing from the database', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    const client = createMockSupabaseClient({ role: 'dm', tokenRow: null });

    registerTokenEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenUpdated', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/token not found/i),
    });
    expect(socket.to).not.toHaveBeenCalled();
  });

  it('tokenUpdated: broadcasts the DB row (not the payload) to roomId and acks ok', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket({ accessToken: 'bearer-token' });
    const tokenDbRow = {
      id: 'token-1',
      room_id: 'room-1',
      name: 'Goblin Scout',
      color: '#E6194B',
      x: 0,
      y: 0,
      assigned_to: 'player-1',
    };

    const client = createMockSupabaseClient({ role: 'dm', tokenRow: tokenDbRow });

    registerTokenEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('tokenUpdated', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(socket.to).toHaveBeenCalledWith('room-1');
    expect(socket._broadcastEmit).toHaveBeenCalledWith('tokenUpdated', tokenDbRow);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('runs safely without error when acknowledge callback is omitted', async () => {
    const io = new EventEmitter();
    const socket = createMockSocket();
    registerTokenEvents(io);
    io.emit('connection', socket);

    expect(() => {
      socket.emit('tokenAdded', { roomId: 'invalid' });
    }).not.toThrow();
  });
});
