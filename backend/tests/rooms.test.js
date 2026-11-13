import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { anonClient, signIn, USERS, TEST_ROOM } from './helpers/db.js';

// Rooms: members-only reads, and create_room / join_room RPCs (password handling).
const uniqueRoomName = (base) => `${base} ${randomUUID()}`;

describe('rooms RLS + room RPCs', () => {
  it('persists DM grid settings and rejects player, outsider and anonymous writes', async () => {
    const dm = await signIn(USERS.dm);
    const { data: roomId, error } = await dm.rpc('create_room', {
      p_name: uniqueRoomName('Grid room'),
      p_password: 'gridpass',
    });
    expect(error).toBeNull();
    const input = { p_room_id: roomId, p_grid_visible: false, p_grid_cell_size: 75 };
    const saved = await dm.rpc('set_room_grid', input);
    expect(saved.error).toBeNull();
    const player = await signIn(USERS.player1);
    const outsider = await signIn(USERS.player2);
    const { data: room } = await dm.from('rooms').select('name').eq('id', roomId).single();
    expect(
      (await player.rpc('join_room', { p_name: room.name, p_password: 'gridpass' })).error,
    ).toBeNull();
    for (const client of [player, outsider, anonClient()]) {
      expect(
        (await client.rpc('set_room_grid', { ...input, p_grid_visible: true })).error,
      ).not.toBeNull();
    }
    const read = await player
      .from('rooms')
      .select('grid_visible, grid_cell_size')
      .eq('id', roomId)
      .single();
    expect(read.error).toBeNull();
    expect(read.data).toEqual({ grid_visible: false, grid_cell_size: 75 });
    expect((await dm.rpc('set_room_grid', { ...input, p_grid_cell_size: 0 })).error).not.toBeNull();
  });

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

  it('join_room rejects null password and prevents unauthorized membership', async () => {
    const dm = await signIn(USERS.dm);
    const roomName = uniqueRoomName('Secure Crypt');
    const { data: roomId, error: createError } = await dm.rpc('create_room', {
      p_name: roomName,
      p_password: 'vault-password',
    });
    expect(createError).toBeNull();

    const player = await signIn(USERS.player2);

    // 1. Passing null password must return an error and create no room membership
    const nullAttempt = await player.rpc('join_room', {
      p_name: roomName,
      p_password: null,
    });
    expect(nullAttempt.error).not.toBeNull();
    expect(nullAttempt.error?.message).toContain('invalid password');

    const { data: nullMembers } = await player
      .from('room_members')
      .select('*')
      .eq('room_id', roomId);
    expect(nullMembers ?? []).toHaveLength(0);

    // 2. Passing a wrong password must reject and create no room membership
    const wrongAttempt = await player.rpc('join_room', {
      p_name: roomName,
      p_password: 'wrong-password',
    });
    expect(wrongAttempt.error).not.toBeNull();
    expect(wrongAttempt.error?.message).toContain('invalid password');

    const { data: wrongMembers } = await player
      .from('room_members')
      .select('*')
      .eq('room_id', roomId);
    expect(wrongMembers ?? []).toHaveLength(0);

    // 3. Successful joining with the correct password creates membership
    const joinAttempt = await player.rpc('join_room', {
      p_name: roomName,
      p_password: 'vault-password',
    });
    expect(joinAttempt.error).toBeNull();
    expect(joinAttempt.data).toBe(roomId);

    const { data: activeMembers } = await player
      .from('room_members')
      .select('role')
      .eq('room_id', roomId);
    expect(activeMembers).toContainEqual({ role: 'player' });
    expect(activeMembers).toContainEqual({ role: 'dm' });

    // 4. Idempotent repeat joining with correct password succeeds without duplicating membership
    const repeatAttempt = await player.rpc('join_room', {
      p_name: roomName,
      p_password: 'vault-password',
    });
    expect(repeatAttempt.error).toBeNull();
    expect(repeatAttempt.data).toBe(roomId);

    const { data: repeatMembers } = await player
      .from('room_members')
      .select('role')
      .eq('room_id', roomId);
    expect(repeatMembers).toHaveLength(2);
    expect(repeatMembers.filter((m) => m.role === 'player')).toHaveLength(1);
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
