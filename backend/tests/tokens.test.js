import { describe, it, expect, beforeAll } from 'vitest';
import { signIn, USERS, TEST_ROOM } from './helpers/db.js';

// Tokens: members read; only the DM writes directly; a player's single write path
// is move_token (x/y only, for a token assigned to them).
describe('tokens RLS + move_token', () => {
  let dm, player1, outsider;
  let ariaToken, goblinToken; // Aria -> player1, Goblin Scout -> DM

  beforeAll(async () => {
    dm = await signIn(USERS.dm);
    player1 = await signIn(USERS.player1);
    outsider = await signIn(USERS.player2); // not a member of the test room
    const { data } = await dm
      .from('tokens')
      .select('id,name,assigned_to')
      .eq('room_id', TEST_ROOM.id);
    ariaToken = data.find((t) => t.name === 'Aria');
    goblinToken = data.find((t) => t.name === 'Goblin Scout');
  });

  it('a member reads tokens; a non-member sees none', async () => {
    const { data: seen } = await player1.from('tokens').select('id').eq('room_id', TEST_ROOM.id);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    const { data: hidden } = await outsider.from('tokens').select('id').eq('room_id', TEST_ROOM.id);
    expect(hidden ?? []).toHaveLength(0);
  });

  it('a player moves their own token via move_token', async () => {
    const { data, error } = await player1.rpc('move_token', {
      p_token_id: ariaToken.id,
      p_x: 9,
      p_y: 9,
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.x).toBe(9);
    expect(row.y).toBe(9);
  });

  it('a player cannot move a token they do not own', async () => {
    const { error } = await player1.rpc('move_token', {
      p_token_id: goblinToken.id,
      p_x: 1,
      p_y: 1,
    });
    expect(error).not.toBeNull();
  });

  it('a player has no direct update path (cannot rename a token)', async () => {
    const { data } = await player1
      .from('tokens')
      .update({ name: 'Hacked' })
      .eq('id', ariaToken.id)
      .select();
    expect(data ?? []).toHaveLength(0); // RLS filtered the row out — 0 updated
    const { data: check } = await dm
      .from('tokens')
      .select('name')
      .eq('id', ariaToken.id)
      .single();
    expect(check.name).toBe('Aria');
  });

  it('a player cannot insert a token', async () => {
    const { error } = await player1
      .from('tokens')
      .insert({ room_id: TEST_ROOM.id, name: 'Cheese', color: '#ffffff', x: 0, y: 0 });
    expect(error).not.toBeNull();
  });

  it('the DM can add, rename, and remove tokens', async () => {
    const { data: inserted, error: insErr } = await dm
      .from('tokens')
      .insert({ room_id: TEST_ROOM.id, name: 'Skeleton', color: '#cccccc', x: 0, y: 0 })
      .select()
      .single();
    expect(insErr).toBeNull();

    const { error: updErr } = await dm
      .from('tokens')
      .update({ name: 'Skeleton Archer', color: '#dddddd' })
      .eq('id', inserted.id);
    expect(updErr).toBeNull();

    const { error: delErr } = await dm.from('tokens').delete().eq('id', inserted.id);
    expect(delErr).toBeNull();
  });
});
