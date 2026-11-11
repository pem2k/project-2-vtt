import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDiceEvents } from '../src/sockets/diceSocket.js';

const ALLOWED_DICE = [
  ['d4', 4],
  ['d6', 6],
  ['d8', 8],
  ['d10', 10],
  ['d12', 12],
  ['d20', 20],
  ['d100', 100],
];

function createMockIo() {
  const io = new EventEmitter();
  const emit = vi.fn();
  io.to = vi.fn(() => ({ emit }));
  io._broadcastEmit = emit;
  return io;
}

function createMockSocket({
  user = {
    id: 'user-1',
    email: 'aria@example.com',
    user_metadata: { username: 'Aria' },
  },
  joinedRooms = ['room-1'],
} = {}) {
  const socket = new EventEmitter();
  socket.user = user;
  socket.rooms = new Set(joinedRooms);
  return socket;
}

function connect({ user, joinedRooms } = {}) {
  const io = createMockIo();
  const socket = createMockSocket({ user, joinedRooms });
  registerDiceEvents(io);
  io.emit('connection', socket);
  return { io, socket };
}

function roll(socket, payload) {
  const ack = vi.fn();
  socket.emit('rollDice', payload, ack);
  return ack;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dice socket events', () => {
  it('rolls on the server and broadcasts diceResult to the whole room', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { io, socket } = connect();

    const ack = roll(socket, {
      roomId: 'room-1',
      die: 'd20',
      playerName: 'Hacker',
      username: 'Also Hacker',
      result: 99,
    });

    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(io.to).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(io._broadcastEmit).toHaveBeenCalledTimes(1);
    expect(io._broadcastEmit).toHaveBeenCalledWith('diceResult', {
      roomId: 'room-1',
      playerName: 'Aria',
      die: 'd20',
      result: 11,
    });

    const result = io._broadcastEmit.mock.calls[0][1].result;
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(20);
  });

  it('accepts dice notation (2d6+5), rolls multiple dice, applies modifier, and broadcasts result', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // d6 -> 2
      .mockReturnValueOnce(0.7); // d6 -> 5
    const { io, socket } = connect();

    const ack = roll(socket, { roomId: 'room-1', notation: '2d6+5' });

    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(io._broadcastEmit).toHaveBeenCalledWith('diceResult', {
      roomId: 'room-1',
      playerName: 'Aria',
      notation: '2d6+5',
      rolls: [2, 5],
      modifier: 5,
      total: 12,
      result: 12,
      die: '2d6+5',
    });
  });

  it('accepts dice notation with negative modifier (1d20-2)', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.4); // d20 -> 9
    const { io, socket } = connect();

    const ack = roll(socket, { roomId: 'room-1', notation: '1d20-2' });

    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(io._broadcastEmit).toHaveBeenCalledWith('diceResult', {
      roomId: 'room-1',
      playerName: 'Aria',
      notation: '1d20-2',
      rolls: [9],
      modifier: -2,
      total: 7,
      result: 7,
      die: '1d20-2',
    });
  });

  it.each(['0d20', '1d7', '2d6+abc', 'invalid'])(
    'rejects invalid notation (%s) and does not broadcast',
    (notation) => {
      const { io, socket } = connect();
      const ack = roll(socket, { roomId: 'room-1', notation });

      expect(ack).toHaveBeenCalledWith({
        ok: false,
        error: expect.stringMatching(/invalid (die|dice notation)/i),
      });
      expect(io.to).not.toHaveBeenCalled();
      expect(io._broadcastEmit).not.toHaveBeenCalled();
    },
  );

  it.each(ALLOWED_DICE)('accepts %s and broadcasts a face from 1 through %i', (die, sides) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const { io, socket } = connect();

    const ack = roll(socket, { roomId: 'room-1', die });

    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(io._broadcastEmit).toHaveBeenCalledWith('diceResult', {
      roomId: 'room-1',
      playerName: 'Aria',
      die,
      result: sides,
    });
  });

  it.each([
    ['d7', 'd7'],
    ['d20; drop', 'd20; drop'],
    ['a number', 20],
    ['missing', undefined],
  ])('rejects an invalid die (%s) and does not broadcast', (_label, die) => {
    const { io, socket } = connect();
    const payload = { roomId: 'room-1' };
    if (die !== undefined) {
      payload.die = die;
    }

    const ack = roll(socket, payload);
    const response = ack.mock.calls[0][0];

    expect(response).toEqual({
      ok: false,
      error: expect.stringMatching(/invalid die/i),
    });
    expect(response.error).not.toContain('d20; drop');
    expect(response.error).not.toMatch(/typeerror|stack|at \w+\s\(/i);
    expect(io.to).not.toHaveBeenCalled();
    expect(io._broadcastEmit).not.toHaveBeenCalled();
  });

  it.each([
    null,
    undefined,
    'room-1',
    {},
    { die: 'd20' },
    { roomId: '', die: 'd20' },
    { roomId: '   ', die: 'd20' },
    { roomId: 1, die: 'd20' },
  ])('rejects an invalid payload (%j) and does not broadcast', (payload) => {
    const { io, socket } = connect();

    const ack = roll(socket, payload);
    const response = ack.mock.calls[0][0];

    expect(response).toEqual({
      ok: false,
      error: expect.stringMatching(/invalid payload/i),
    });
    expect(typeof response.error).toBe('string');
    expect(response.error).not.toMatch(/typeerror|stack|at \w+\s\(/i);
    expect(io.to).not.toHaveBeenCalled();
    expect(io._broadcastEmit).not.toHaveBeenCalled();
  });

  it('rejects a roll when the socket has not joined the room', () => {
    const { io, socket } = connect({ joinedRooms: ['room-2'] });

    const ack = roll(socket, { roomId: 'room-1', die: 'd20' });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/not in room/i),
    });
    expect(io.to).not.toHaveBeenCalled();
    expect(io._broadcastEmit).not.toHaveBeenCalled();
  });

  it('rejects a roll when the socket has no rooms set', () => {
    const { io, socket } = connect({ joinedRooms: [] });
    socket.rooms = undefined;

    const ack = roll(socket, { roomId: 'room-1', die: 'd8' });

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringMatching(/not in room/i),
    });
    expect(io.to).not.toHaveBeenCalled();
  });

  it('uses the email local-part when the server user has no username', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { io, socket } = connect({
      user: { id: 'user-2', email: 'samwise@shire.test' },
    });

    roll(socket, { roomId: 'room-1', die: 'd6', playerName: 'Client Name' });

    expect(io._broadcastEmit).toHaveBeenCalledWith('diceResult', {
      roomId: 'room-1',
      playerName: 'samwise',
      die: 'd6',
      result: 1,
    });
  });

  it('uses Player when the server user has no username or email', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { io, socket } = connect({ user: { id: 'user-3' } });

    roll(socket, { roomId: 'room-1', die: 'd4', playerName: 'Client Name' });

    expect(io._broadcastEmit).toHaveBeenCalledWith('diceResult', {
      roomId: 'room-1',
      playerName: 'Player',
      die: 'd4',
      result: 1,
    });
  });

  it('prefers user_metadata.username over a client-supplied name and the email', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { io, socket } = connect({
      user: {
        id: 'user-1',
        email: 'aria@example.com',
        user_metadata: { username: 'Aria' },
      },
    });

    roll(socket, { roomId: 'room-1', die: 'd12', playerName: 'Not Aria' });

    expect(io._broadcastEmit).toHaveBeenCalledWith(
      'diceResult',
      expect.objectContaining({ playerName: 'Aria', die: 'd12', result: 1 }),
    );
  });

  it('runs safely without an acknowledge callback and still broadcasts', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { io, socket } = connect();

    expect(() => {
      socket.emit('rollDice', { roomId: 'room-1', die: 'd10' });
    }).not.toThrow();

    expect(io._broadcastEmit).toHaveBeenCalledWith('diceResult', {
      roomId: 'room-1',
      playerName: 'Aria',
      die: 'd10',
      result: 1,
    });
  });

  it('does not throw when an invalid roll omits the acknowledge callback', () => {
    const { io, socket } = connect({ joinedRooms: [] });

    expect(() => {
      socket.emit('rollDice', { roomId: 'room-1', die: 'd20' });
    }).not.toThrow();
    expect(io.to).not.toHaveBeenCalled();
  });
});
