import { describe, expect, it, vi } from 'vitest';
import { createRoom, joinRoom, validateJoinDetails, validateRoomDetails } from './rooms.js';

describe('validateRoomDetails', () => {
  it('rejects an empty room name', () => {
    expect(validateRoomDetails({ roomName: '  ', password: 'secret' })).toMatch(/room name/i);
  });

  it('rejects a blank password', () => {
    expect(validateRoomDetails({ roomName: 'Dungeon', password: ' ' })).toMatch(/password/i);
  });

  it('accepts a room name and password', () => {
    expect(validateRoomDetails({ roomName: 'Dungeon', password: 'secret' })).toBeNull();
  });
});

describe('createRoom', () => {
  it('calls the create_room RPC with the room details', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'room-123', room_code: 'ABC123' }],
      error: null,
    });
    const client = { rpc };

    await expect(createRoom(client, { roomName: 'Dungeon', password: 'secret' })).resolves.toEqual({
      id: 'room-123',
      room_code: 'ABC123',
    });
    expect(rpc).toHaveBeenCalledWith('create_room', {
      p_name: 'Dungeon',
      p_password: 'secret',
    });
  });

  it('throws the RPC error when room creation fails', async () => {
    const error = new Error('Room could not be created');
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error }),
    };

    await expect(createRoom(client, { roomName: 'Dungeon', password: 'secret' })).rejects.toThrow(
      'Room could not be created',
    );
  });
});

describe('validateJoinDetails', () => {
  it('rejects an empty room code', () => {
    expect(validateJoinDetails({ roomCode: '  ', password: 'secret' })).toMatch(/room code/i);
  });

  it('rejects a blank password', () => {
    expect(validateJoinDetails({ roomCode: 'ABC123', password: ' ' })).toMatch(/password/i);
  });

  it('accepts a room code and password', () => {
    expect(validateJoinDetails({ roomCode: 'ABC123', password: 'secret' })).toBeNull();
  });
});

describe('joinRoom', () => {
  it('calls the join_room RPC and returns the room id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'room-123', error: null });
    const client = { rpc };

    await expect(joinRoom(client, { roomCode: ' abc123 ', password: 'secret' })).resolves.toBe(
      'room-123',
    );
    expect(rpc).toHaveBeenCalledWith('join_room', {
      p_room_code: 'ABC123',
      p_password: 'secret',
    });
  });

  it('throws the RPC error when joining fails', async () => {
    const error = new Error('invalid password');
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error }) };

    await expect(joinRoom(client, { roomCode: 'ABC123', password: 'wrong' })).rejects.toThrow(
      'invalid password',
    );
  });
});
