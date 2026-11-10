import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerTokenEvents } from '../src/sockets/tokenSocket.js';

function createMockIo() {
  const io = new EventEmitter();
  const emit = vi.fn();
  io.to = vi.fn(() => ({ emit }));
  io._roomEmit = emit;
  return io;
}

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

  describe('moveToken event', () => {
    it('rejects an invalid payload', async () => {
      const io = new EventEmitter();
      const socket = createMockSocket();
      registerTokenEvents(io);
      io.emit('connection', socket);

      const ack = vi.fn();
      socket.emit('moveToken', { roomId: '', tokenId: 'token-1' }, ack);
      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: expect.stringMatching(/invalid payload/i),
      });
    });

    it('rejects when socket has not joined the room', async () => {
      const io = new EventEmitter();
      const socket = createMockSocket({ joinedRooms: [] });
      registerTokenEvents(io);
      io.emit('connection', socket);

      const ack = vi.fn();
      socket.emit('moveToken', { roomId: 'room-1', tokenId: 'token-1' }, ack);
      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: expect.stringMatching(/not in room/i),
      });
    });

    it('rejects when user is not a member of the room', async () => {
      const io = new EventEmitter();
      const socket = createMockSocket({ userId: 'user-outsider' });
      const client = createMockSupabaseClient({ role: null });

      registerTokenEvents(io, { createUserClient: () => client });
      io.emit('connection', socket);

      const ack = vi.fn();
      await new Promise((resolve) => {
        socket.emit('moveToken', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
          ack(res);
          resolve();
        });
      });

      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: expect.stringMatching(/not a member/i),
      });
    });

    it('rejects when token is missing from the database', async () => {
      const io = new EventEmitter();
      const socket = createMockSocket({ userId: 'user-player' });
      const client = createMockSupabaseClient({ role: 'player', tokenRow: null });

      registerTokenEvents(io, { createUserClient: () => client });
      io.emit('connection', socket);

      const ack = vi.fn();
      await new Promise((resolve) => {
        socket.emit('moveToken', { roomId: 'room-1', tokenId: 'token-missing' }, (res) => {
          ack(res);
          resolve();
        });
      });

      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: expect.stringMatching(/token not found/i),
      });
    });

    it('rejects when non-DM player tries to move an unassigned token', async () => {
      const io = new EventEmitter();
      const socket = createMockSocket({ userId: 'user-player' });
      const unassignedToken = {
        id: 'token-1',
        room_id: 'room-1',
        name: 'Goblin',
        assigned_to: null,
        x: 5,
        y: 5,
      };
      const client = createMockSupabaseClient({ role: 'player', tokenRow: unassignedToken });

      registerTokenEvents(io, { createUserClient: () => client });
      io.emit('connection', socket);

      const ack = vi.fn();
      await new Promise((resolve) => {
        socket.emit('moveToken', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
          ack(res);
          resolve();
        });
      });

      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: expect.stringMatching(/not authorized/i),
      });
    });

    it('rejects when non-DM player tries to move a token assigned to another player', async () => {
      const io = new EventEmitter();
      const socket = createMockSocket({ userId: 'user-player-1' });
      const tokenAssignedToOther = {
        id: 'token-1',
        room_id: 'room-1',
        name: 'Aria',
        assigned_to: 'user-player-2',
        x: 3,
        y: 4,
      };
      const client = createMockSupabaseClient({ role: 'player', tokenRow: tokenAssignedToOther });

      registerTokenEvents(io, { createUserClient: () => client });
      io.emit('connection', socket);

      const ack = vi.fn();
      await new Promise((resolve) => {
        socket.emit('moveToken', { roomId: 'room-1', tokenId: 'token-1' }, (res) => {
          ack(res);
          resolve();
        });
      });

      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: expect.stringMatching(/not authorized/i),
      });
    });

    it('allows assigned player to move their token and broadcasts authoritative row to the room including sender', async () => {
      const io = createMockIo();
      const socket = createMockSocket({ userId: 'user-player-1' });
      const ownToken = {
        id: 'token-1',
        room_id: 'room-1',
        name: 'Aria',
        assigned_to: 'user-player-1',
        x: 8.5,
        y: 9.25,
      };
      const client = createMockSupabaseClient({ role: 'player', tokenRow: ownToken });

      registerTokenEvents(io, { createUserClient: () => client });
      io.emit('connection', socket);

      const ack = vi.fn();
      await new Promise((resolve) => {
        socket.emit(
          'moveToken',
          { roomId: 'room-1', tokenId: 'token-1', fakeCoordinates: [999, 999] },
          (res) => {
            ack(res);
            resolve();
          },
        );
      });

      expect(ack).toHaveBeenCalledWith({ ok: true });
      expect(io.to).toHaveBeenCalledWith('room-1');
      expect(io._roomEmit).toHaveBeenCalledWith('tokenMoved', ownToken);
      // Movement broadcast must include the sender via io.to rather than socket.to
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('allows DM to move any token (including unassigned) and broadcasts to the room', async () => {
      const io = createMockIo();
      const socket = createMockSocket({ userId: 'user-dm' });
      const unassignedToken = {
        id: 'token-unassigned',
        room_id: 'room-1',
        name: 'Goblin Scout',
        assigned_to: null,
        x: 12,
        y: 15,
      };
      const client = createMockSupabaseClient({ role: 'dm', tokenRow: unassignedToken });

      registerTokenEvents(io, { createUserClient: () => client });
      io.emit('connection', socket);

      const ack = vi.fn();
      await new Promise((resolve) => {
        socket.emit('moveToken', { roomId: 'room-1', tokenId: 'token-unassigned' }, (res) => {
          ack(res);
          resolve();
        });
      });

      expect(ack).toHaveBeenCalledWith({ ok: true });
      expect(io.to).toHaveBeenCalledWith('room-1');
      expect(io._roomEmit).toHaveBeenCalledWith('tokenMoved', unassignedToken);
      expect(socket.to).not.toHaveBeenCalled();
    });
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
