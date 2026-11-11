import { describe, expect, it, vi } from 'vitest';
import {
  createRoom,
  getRoomMembers,
  getRoomName,
  joinRoom,
  validateRoomDetails,
} from '../rooms.js';

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
      data: 'room-123',
      error: null,
    });
    const client = { rpc };

    await expect(createRoom(client, { roomName: 'Dungeon', password: 'secret' })).resolves.toBe(
      'room-123',
    );
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

describe('joinRoom', () => {
  it('calls the join_room RPC and returns the room id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'room-123', error: null });
    const client = { rpc };

    await expect(joinRoom(client, { roomName: ' Dungeon ', password: 'secret' })).resolves.toBe(
      'room-123',
    );
    expect(rpc).toHaveBeenCalledWith('join_room', {
      p_name: 'Dungeon',
      p_password: 'secret',
    });
  });

  it('throws the RPC error when joining fails', async () => {
    const error = new Error('invalid password');
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error }) };

    await expect(joinRoom(client, { roomName: 'Dungeon', password: 'wrong' })).rejects.toThrow(
      'invalid password',
    );
  });
});

describe('getRoomName', () => {
  it('reads the member-visible room name by id', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ name: 'The Sunless Citadel' }],
        error: null,
      }),
    };
    const client = { from: vi.fn().mockReturnValue(query) };

    await expect(getRoomName(client, 'room-123')).resolves.toBe('The Sunless Citadel');
    expect(client.from).toHaveBeenCalledWith('rooms');
    expect(query.select).toHaveBeenCalledWith('name');
    expect(query.eq).toHaveBeenCalledWith('id', 'room-123');
  });
});

describe('getRoomMembers', () => {
  it('calls the get_room_members RPC with the room id', async () => {
    const mockMembers = [
      { user_id: 'u1', role: 'dm', display_name: 'DM' },
      { user_id: 'u2', role: 'player', display_name: 'Player 1' },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: mockMembers, error: null });
    const client = { rpc };

    await expect(getRoomMembers(client, 'room-123')).resolves.toEqual(mockMembers);
    expect(rpc).toHaveBeenCalledWith('get_room_members', {
      p_room_id: 'room-123',
    });
  });

  it('throws when the get_room_members RPC fails', async () => {
    const error = new Error('not a member of this room');
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error }) };

    await expect(getRoomMembers(client, 'room-123')).rejects.toThrow('not a member of this room');
  });
});
