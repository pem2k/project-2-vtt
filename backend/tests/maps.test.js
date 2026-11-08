import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { anonClient, signIn, USERS, TEST_ROOM } from './helpers/db.js';

describe('maps schema & RLS policies (#7)', () => {
  it('anon cannot read maps', async () => {
    const { data } = await anonClient().from('maps').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('room members can read maps; outsiders cannot', async () => {
    const dm = await signIn(USERS.dm);
    const { data: inserted, error: insertError } = await dm
      .from('maps')
      .insert({
        room_id: TEST_ROOM.id,
        name: 'Dungeon Level 1',
        url: 'https://example.com/map1.png',
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(inserted).toBeDefined();

    // Player 1 is a member of TEST_ROOM
    const player1 = await signIn(USERS.player1);
    const { data: playerView, error: playerError } = await player1
      .from('maps')
      .select('*')
      .eq('id', inserted.id);

    expect(playerError).toBeNull();
    expect(playerView).toHaveLength(1);

    // Player 2 is NOT a member of TEST_ROOM
    const player2 = await signIn(USERS.player2);
    const { data: outsiderView } = await player2.from('maps').select('*').eq('id', inserted.id);

    expect(outsiderView ?? []).toHaveLength(0);
  });

  it('players cannot insert or delete maps; only DM can', async () => {
    const player1 = await signIn(USERS.player1);
    const { error: playerInsertError } = await player1.from('maps').insert({
      room_id: TEST_ROOM.id,
      name: 'Player Rogue Map',
      url: 'https://example.com/hack.png',
    });

    expect(playerInsertError).toBeDefined();

    const dm = await signIn(USERS.dm);
    const { data: dmMap, error: dmInsertError } = await dm
      .from('maps')
      .insert({
        room_id: TEST_ROOM.id,
        name: 'DM Map for deletion test',
        url: 'https://example.com/delete.png',
      })
      .select()
      .single();

    expect(dmInsertError).toBeNull();

    // Player cannot delete DM map
    await player1.from('maps').delete().eq('id', dmMap.id);

    // Either error returned or 0 rows deleted due to RLS
    const { data: stillExists } = await dm.from('maps').select('id').eq('id', dmMap.id);
    expect(stillExists).toHaveLength(1);

    // DM can delete
    const { error: dmDeleteError } = await dm.from('maps').delete().eq('id', dmMap.id);
    expect(dmDeleteError).toBeNull();
  });

  it('automatically sets active_map_id on rooms when the first map is inserted', async () => {
    const dm = await signIn(USERS.dm);
    // Create fresh room with no maps
    const { data: newRoomId, error: roomError } = await dm.rpc('create_room', {
      p_name: `Castle Ravenloft ${randomUUID()}`,
      p_password: 'vampirepassword',
    });
    expect(roomError).toBeNull();

    // Check active_map_id is initially null
    const { data: initialRoom } = await dm
      .from('rooms')
      .select('active_map_id')
      .eq('id', newRoomId)
      .single();
    expect(initialRoom.active_map_id).toBeNull();

    // Insert first map
    const { data: firstMap, error: map1Error } = await dm
      .from('maps')
      .insert({
        room_id: newRoomId,
        name: 'Ravenloft Floor 1',
        url: 'https://example.com/ravenloft1.png',
      })
      .select()
      .single();
    expect(map1Error).toBeNull();

    // Verify room.active_map_id was set to firstMap.id
    const { data: updatedRoom } = await dm
      .from('rooms')
      .select('active_map_id')
      .eq('id', newRoomId)
      .single();
    expect(updatedRoom.active_map_id).toBe(firstMap.id);

    // Insert second map: active_map_id should NOT change automatically
    const { error: map2Error } = await dm
      .from('maps')
      .insert({
        room_id: newRoomId,
        name: 'Ravenloft Catacombs',
        url: 'https://example.com/catacombs.png',
      })
      .select()
      .single();
    expect(map2Error).toBeNull();

    const { data: roomAfterSecondMap } = await dm
      .from('rooms')
      .select('active_map_id')
      .eq('id', newRoomId)
      .single();
    expect(roomAfterSecondMap.active_map_id).toBe(firstMap.id);
  });
});

describe('set_active_map RPC (#19)', () => {
  it('the DM switches the active map and it persists', async () => {
    const dm = await signIn(USERS.dm);
    const { data: roomId } = await dm.rpc('create_room', {
      p_name: `Switch Persist ${randomUUID()}`,
      p_password: 'switchpass',
    });

    const { data: map1 } = await dm
      .from('maps')
      .insert({ room_id: roomId, name: 'Floor 1', url: 'https://example.com/f1.png' })
      .select()
      .single();
    const { data: map2 } = await dm
      .from('maps')
      .insert({ room_id: roomId, name: 'Floor 2', url: 'https://example.com/f2.png' })
      .select()
      .single();

    const before = await dm.from('rooms').select('active_map_id').eq('id', roomId).single();
    expect(before.data.active_map_id).toBe(map1.id);

    const { error: switchErr } = await dm.rpc('set_active_map', {
      p_room_id: roomId,
      p_map_id: map2.id,
    });
    expect(switchErr).toBeNull();

    const after = await dm.from('rooms').select('active_map_id').eq('id', roomId).single();
    expect(after.data.active_map_id).toBe(map2.id);
  });

  it('a non-DM cannot switch the active map', async () => {
    const dm = await signIn(USERS.dm);
    const { data: roomId } = await dm.rpc('create_room', {
      p_name: `Switch Guard ${randomUUID()}`,
      p_password: 'guardpass',
    });
    const { data: map1 } = await dm
      .from('maps')
      .insert({ room_id: roomId, name: 'Floor 1', url: 'https://example.com/g1.png' })
      .select()
      .single();
    const { data: map2 } = await dm
      .from('maps')
      .insert({ room_id: roomId, name: 'Floor 2', url: 'https://example.com/g2.png' })
      .select()
      .single();

    const outsider = await signIn(USERS.player1);
    const { error } = await outsider.rpc('set_active_map', {
      p_room_id: roomId,
      p_map_id: map2.id,
    });
    expect(error).not.toBeNull();

    const after = await dm.from('rooms').select('active_map_id').eq('id', roomId).single();
    expect(after.data.active_map_id).toBe(map1.id);
  });

  it('rejects a map that belongs to a different room', async () => {
    const dm = await signIn(USERS.dm);
    const { data: roomA } = await dm.rpc('create_room', {
      p_name: `Room A ${randomUUID()}`,
      p_password: 'apass',
    });
    const { data: roomB } = await dm.rpc('create_room', {
      p_name: `Room B ${randomUUID()}`,
      p_password: 'bpass',
    });
    await dm
      .from('maps')
      .insert({ room_id: roomA, name: 'A map', url: 'https://example.com/a.png' })
      .select()
      .single();
    const { data: mapB } = await dm
      .from('maps')
      .insert({ room_id: roomB, name: 'B map', url: 'https://example.com/b.png' })
      .select()
      .single();

    const { error } = await dm.rpc('set_active_map', {
      p_room_id: roomA,
      p_map_id: mapB.id,
    });
    expect(error).not.toBeNull();
  });
});
