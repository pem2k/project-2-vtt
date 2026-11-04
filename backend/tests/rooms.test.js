import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { anonClient, signIn, USERS, TEST_ROOM } from './helpers/db.js';

// Rooms: members-only reads, and create_room / join_room RPCs (password handling).
const uniqueRoomName = (base) => `${base} ${randomUUID()}`;

describe('rooms RLS + room RPCs', () => {
  it('anon cannot read rooms', async () => {
    const { data } = await anonClient().from('rooms').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('a member can read their room; a non-member cannot', async () => {
    const dm = await signIn(USERS.dm);
    const { data: seen } = await dm.from('rooms').select('id').eq('id', TEST_ROOM.id);
    expect(seen).toHaveLength(1);

    const outsider = await signIn(USERS.player2); // not a member of the test room
    const { data: hidden } = await outsider.from('rooms').select('id').eq('id', TEST_ROOM.id);
    expect(hidden ?? []).toHaveLength(0);
  });

  it('create_room makes the caller the DM and returns only the new room id', async () => {
    const dm = await signIn(USERS.dm);
    const roomName = uniqueRoomName('Waterdeep Nights');
    const { data, error } = await dm.rpc('create_room', {
      p_name: roomName,
      p_password: 'secret123',
    });
    expect(error).toBeNull();
    expect(data).toMatch(/^[0-9a-f-]{36}$/i);

    // Creator is now a DM member and can read the room.
    const { data: membership } = await dm.from('room_members').select('role').eq('room_id', data);
    expect(membership).toEqual([{ role: 'dm' }]);
  });

  it('create_room rejects duplicate names case-insensitively after trimming', async () => {
    const dm = await signIn(USERS.dm);
    const roomName = uniqueRoomName('Barovia');
    const first = await dm.rpc('create_room', {
      p_name: `  ${roomName}  `,
      p_password: 'mist',
    });
    expect(first.error).toBeNull();

    const duplicate = await dm.rpc('create_room', {
      p_name: roomName.toLowerCase(),
      p_password: 'another',
    });
    expect(duplicate.error).not.toBeNull();
    expect(duplicate.error.message).toContain('room name already taken');
  });

  it('join_room looks up a trimmed room name case-insensitively', async () => {
    const dm = await signIn(USERS.dm);
    const roomName = uniqueRoomName('Barovia');
    const { data: roomId } = await dm.rpc('create_room', {
      p_name: roomName,
      p_password: 'mist',
    });

    const player = await signIn(USERS.player2);
    const { data, error } = await player.rpc('join_room', {
      p_name: `  ${roomName.toLowerCase()}  `,
      p_password: 'mist',
    });
    expect(error).toBeNull();
    expect(data).toBe(roomId);

    const { data: seen } = await player.from('rooms').select('id').eq('id', roomId);
    expect(seen).toHaveLength(1);
  });

  it('join_room rejects a wrong password', async () => {
    const dm = await signIn(USERS.dm);
    const roomName = uniqueRoomName('Icewind');
    const { error: createError } = await dm.rpc('create_room', {
      p_name: roomName,
      p_password: 'right',
    });
    expect(createError).toBeNull();

    const player = await signIn(USERS.player2);
    const { error } = await player.rpc('join_room', {
      p_name: roomName,
      p_password: 'wrong',
    });
    expect(error?.message).toContain('invalid password');
  });

  it('join_room rejects an unknown room name', async () => {
    const player = await signIn(USERS.player2);
    const { error } = await player.rpc('join_room', {
      p_name: 'Unknown Room',
      p_password: 'whatever',
    });
    expect(error?.message).toContain('room not found');
  });

  it('room RPCs require authentication', async () => {
    const anon = anonClient();
    const createResult = await anon.rpc('create_room', {
      p_name: 'Anonymous Room',
      p_password: 'secret',
    });
    const joinResult = await anon.rpc('join_room', {
      p_name: 'The Sunless Citadel',
      p_password: 'roompass',
    });

    expect(createResult.error?.message).toContain('authentication required');
    expect(joinResult.error?.message).toContain('authentication required');
  });
});
