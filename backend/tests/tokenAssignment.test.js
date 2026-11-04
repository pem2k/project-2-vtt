import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signIn, USERS, TEST_ROOM } from './helpers/db.js';

describe('token assignment RLS & trigger & get_room_members', () => {
  let dm, player1, player2;
  let goblinToken, dmUser, player1User, player2User;

  beforeAll(async () => {
    dm = await signIn(USERS.dm);
    player1 = await signIn(USERS.player1);
    player2 = await signIn(USERS.player2);

    const {
      data: { user: uDm },
    } = await dm.auth.getUser();
    const {
      data: { user: uP1 },
    } = await player1.auth.getUser();
    const {
      data: { user: uP2 },
    } = await player2.auth.getUser();

    dmUser = uDm;
    player1User = uP1;
    player2User = uP2;

    const { data } = await dm
      .from('tokens')
      .select('*')
      .eq('room_id', TEST_ROOM.id)
      .eq('name', 'Goblin Scout')
      .single();
    goblinToken = data;
  });

  afterAll(async () => {
    // Restore Goblin Scout to DM
    if (goblinToken && dm) {
      await dm.from('tokens').update({ assigned_to: dmUser.id }).eq('id', goblinToken.id);
    }
  });

  it('the DM assigns Goblin Scout to player1 and unassigns with null', async () => {
    // Assign to player1
    const { data: assigned, error: assignErr } = await dm
      .from('tokens')
      .update({ assigned_to: player1User.id })
      .eq('id', goblinToken.id)
      .select()
      .single();

    expect(assignErr).toBeNull();
    expect(assigned.assigned_to).toBe(player1User.id);

    // Unassign with null
    const { data: unassigned, error: unassignErr } = await dm
      .from('tokens')
      .update({ assigned_to: null })
      .eq('id', goblinToken.id)
      .select()
      .single();

    expect(unassignErr).toBeNull();
    expect(unassigned.assigned_to).toBeNull();
  });

  it('the DM assigning to player2 (non-member) fails with error and row is unchanged', async () => {
    const { error } = await dm
      .from('tokens')
      .update({ assigned_to: player2User.id })
      .eq('id', goblinToken.id);

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/assignee must be a member of the room/i);

    // Check row unchanged through DM client
    const { data: current } = await dm
      .from('tokens')
      .select('assigned_to')
      .eq('id', goblinToken.id)
      .single();

    // Since previous test left it null (or before that), it should definitely NOT be player2User.id
    expect(current.assigned_to).not.toBe(player2User.id);
  });

  it('player1 cannot update assigned_to directly', async () => {
    const { data } = await player1
      .from('tokens')
      .update({ assigned_to: player1User.id })
      .eq('id', goblinToken.id)
      .select();

    expect(data ?? []).toHaveLength(0);

    const { data: check } = await dm
      .from('tokens')
      .select('assigned_to')
      .eq('id', goblinToken.id)
      .single();

    expect(check.assigned_to).not.toBe(player1User.id);
  });

  it('get_room_members as player1 returns exactly 2 rows, DM first, with display_name and no email', async () => {
    const { data, error } = await player1.rpc('get_room_members', {
      p_room_id: TEST_ROOM.id,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(2);

    // DM first
    expect(data[0].role).toBe('dm');
    expect(data[0].user_id).toBe(dmUser.id);
    expect(data[0].display_name).toBeTruthy();
    expect(data[0]).not.toHaveProperty('email');

    // Player second
    expect(data[1].role).toBe('player');
    expect(data[1].user_id).toBe(player1User.id);
    expect(data[1].display_name).toBeTruthy();
    expect(data[1]).not.toHaveProperty('email');
  });

  it('get_room_members as player2 (outsider) fails with error', async () => {
    const { data, error } = await player2.rpc('get_room_members', {
      p_room_id: TEST_ROOM.id,
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/not a member of this room/i);
    expect(data).toBeNull();
  });
});
