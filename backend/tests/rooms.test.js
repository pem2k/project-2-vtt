import { describe, it, expect } from 'vitest';
import { anonClient, signIn, USERS, TEST_ROOM } from './helpers/db.js';

// Rooms: members-only reads, and create_room / join_room RPCs (password handling).
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

  it('create_room makes the caller the DM and returns a 6-char code', async () => {
    const dm = await signIn(USERS.dm);
    const { data, error } = await dm.rpc('create_room', {
      p_name: 'Waterdeep Nights',
      p_password: 'secret123',
    });
    expect(error).toBeNull();
    const room = Array.isArray(data) ? data[0] : data;
    expect(room.room_code).toMatch(/^[A-Z0-9]{6}$/);

    // Creator is now a DM member and can read the room.
    const { data: membership } = await dm
      .from('room_members')
      .select('role')
      .eq('room_id', room.id);
    expect(membership).toEqual([{ role: 'dm' }]);
  });

  it('join_room adds a player with the correct password', async () => {
    const dm = await signIn(USERS.dm);
    const { data } = await dm.rpc('create_room', {
      p_name: 'Barovia',
      p_password: 'mist',
    });
    const room = Array.isArray(data) ? data[0] : data;

    const player = await signIn(USERS.player2);
    const { error } = await player.rpc('join_room', {
      p_room_code: room.room_code,
      p_password: 'mist',
    });
    expect(error).toBeNull();

    const { data: seen } = await player.from('rooms').select('id').eq('id', room.id);
    expect(seen).toHaveLength(1);
  });

  it('join_room rejects a wrong password', async () => {
    const dm = await signIn(USERS.dm);
    const { data } = await dm.rpc('create_room', { p_name: 'Icewind', p_password: 'right' });
    const room = Array.isArray(data) ? data[0] : data;

    const player = await signIn(USERS.player2);
    const { error } = await player.rpc('join_room', {
      p_room_code: room.room_code,
      p_password: 'wrong',
    });
    expect(error).not.toBeNull();
  });

  it('join_room rejects an unknown room code', async () => {
    const player = await signIn(USERS.player2);
    const { error } = await player.rpc('join_room', {
      p_room_code: 'ZZZZZZ',
      p_password: 'whatever',
    });
    expect(error).not.toBeNull();
  });
});
