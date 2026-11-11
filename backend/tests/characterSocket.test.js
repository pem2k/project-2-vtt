import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerCharacterEvents } from '../src/sockets/characterSocket.js';

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
  return socket;
}

function createMockSupabaseClient({
  role = 'dm',
  memberError = null,
  characterRow = null,
  characterError = null,
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
      if (table === 'characters') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: characterRow,
                  error: characterError,
                }),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  };
}

describe('characterSocket - characterUpdated', () => {
  it('rejects invalid payload', async () => {
    const io = createMockIo();
    const socket = createMockSocket();
    registerCharacterEvents(io);
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('characterUpdated', { roomId: '', characterId: 'c1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Invalid payload.' });
  });

  it('rejects when socket is not in room', async () => {
    const io = createMockIo();
    const socket = createMockSocket({ joinedRooms: [] });
    registerCharacterEvents(io);
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('characterUpdated', { roomId: 'room-1', characterId: 'c1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Socket is not in room.' });
  });

  it('rejects when caller is not a member of the room', async () => {
    const io = createMockIo();
    const socket = createMockSocket();
    const client = createMockSupabaseClient({ role: null });
    registerCharacterEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('characterUpdated', { roomId: 'room-1', characterId: 'c1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'You are not a member of this room.' });
  });

  it('rejects when character is not found', async () => {
    const io = createMockIo();
    const socket = createMockSocket();
    const client = createMockSupabaseClient({ role: 'dm', characterRow: null });
    registerCharacterEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('characterUpdated', { roomId: 'room-1', characterId: 'c1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Character not found.' });
  });

  it('rejects when a player attempts to notify an update for someone else character', async () => {
    const io = createMockIo();
    const socket = createMockSocket({ userId: 'player-1' });
    const client = createMockSupabaseClient({
      role: 'player',
      characterRow: { id: 'c1', user_id: 'other-user', name: 'Goblin' },
    });
    registerCharacterEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('characterUpdated', { roomId: 'room-1', characterId: 'c1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: 'Not authorized to update this character.',
    });
    expect(io._roomEmit).not.toHaveBeenCalled();
  });

  it('broadcasts authoritative DB row to room including sender for DM', async () => {
    const io = createMockIo();
    const socket = createMockSocket({ userId: 'dm-user' });
    const characterRow = {
      id: 'c1',
      room_id: 'room-1',
      user_id: 'player-1',
      name: 'Aria',
      hp: 14,
      max_hp: 20,
    };
    const client = createMockSupabaseClient({
      role: 'dm',
      characterRow,
    });
    registerCharacterEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('characterUpdated', { roomId: 'room-1', characterId: 'c1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(io._roomEmit).toHaveBeenCalledWith('characterUpdated', characterRow);
  });

  it('broadcasts authoritative DB row to room including sender for character owner player', async () => {
    const io = createMockIo();
    const socket = createMockSocket({ userId: 'player-1' });
    const characterRow = {
      id: 'c1',
      room_id: 'room-1',
      user_id: 'player-1',
      name: 'Aria',
      hp: 12,
      max_hp: 20,
    };
    const client = createMockSupabaseClient({
      role: 'player',
      characterRow,
    });
    registerCharacterEvents(io, { createUserClient: () => client });
    io.emit('connection', socket);

    const ack = vi.fn();
    await new Promise((resolve) => {
      socket.emit('characterUpdated', { roomId: 'room-1', characterId: 'c1' }, (res) => {
        ack(res);
        resolve();
      });
    });

    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(io._roomEmit).toHaveBeenCalledWith('characterUpdated', characterRow);
  });
});
