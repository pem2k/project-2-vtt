import { describe, it, expect, beforeAll } from 'vitest';
import { signIn, USERS, TEST_ROOM } from './helpers/db.js';

const DM_ID = '11111111-1111-1111-1111-111111111111';
const PLAYER1_ID = '22222222-2222-2222-2222-222222222222';

// Characters: members read all cards; a player edits only their own hp/notes via
// update_character; the DM edits all fields directly; one card per player, many for DM.
describe('characters RLS, update_character, one-per-player trigger', () => {
  let dm, player1, outsider;
  let ariaChar, goblinBoss;

  beforeAll(async () => {
    dm = await signIn(USERS.dm);
    player1 = await signIn(USERS.player1);
    outsider = await signIn(USERS.player2);
    const { data } = await dm
      .from('characters')
      .select('id,name,user_id')
      .eq('room_id', TEST_ROOM.id);
    ariaChar = data.find((c) => c.name === 'Aria the Rogue');
    goblinBoss = data.find((c) => c.name === 'Goblin Boss');
  });

  it('a member reads all cards; a non-member sees none', async () => {
    const { data: seen } = await player1
      .from('characters')
      .select('id')
      .eq('room_id', TEST_ROOM.id);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    const { data: hidden } = await outsider
      .from('characters')
      .select('id')
      .eq('room_id', TEST_ROOM.id);
    expect(hidden ?? []).toHaveLength(0);
  });

  it('a player cannot change max_hp/ac (no direct update path)', async () => {
    const { data } = await player1
      .from('characters')
      .update({ max_hp: 999, ac: 99 })
      .eq('id', ariaChar.id)
      .select();
    expect(data ?? []).toHaveLength(0);
    const { data: check } = await dm
      .from('characters')
      .select('max_hp,ac')
      .eq('id', ariaChar.id)
      .single();
    expect(check.max_hp).toBe(22);
    expect(check.ac).toBe(14);
  });

  it('a player edits their own hp/notes via update_character', async () => {
    const { data, error } = await player1.rpc('update_character', {
      p_character_id: ariaChar.id,
      p_hp: 7,
      p_notes: 'Bloodied',
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.hp).toBe(7);
    expect(row.notes).toBe('Bloodied');
  });

  it("a player cannot edit someone else's card via update_character", async () => {
    const { error } = await player1.rpc('update_character', {
      p_character_id: goblinBoss.id,
      p_hp: 1,
    });
    expect(error).not.toBeNull();
  });

  it('the DM edits all fields of any card directly', async () => {
    const { error } = await dm
      .from('characters')
      .update({ ac: 16, max_hp: 25, notes: 'DM adjusted' })
      .eq('id', ariaChar.id);
    expect(error).toBeNull();
  });

  it('a player may hold only one character in a room (trigger blocks a second)', async () => {
    const { error } = await player1.from('characters').insert({
      room_id: TEST_ROOM.id,
      user_id: PLAYER1_ID,
      name: 'Second PC',
      hp: 10,
      max_hp: 10,
      ac: 10,
    });
    expect(error).not.toBeNull();
  });

  it('the DM may own multiple character cards (NPCs)', async () => {
    const { error } = await dm.from('characters').insert({
      room_id: TEST_ROOM.id,
      user_id: DM_ID,
      name: 'Dire Wolf',
      hp: 20,
      max_hp: 20,
      ac: 14,
    });
    expect(error).toBeNull();
  });

  it('a member cannot insert a card owned by someone else', async () => {
    const { error } = await player1.from('characters').insert({
      room_id: TEST_ROOM.id,
      user_id: DM_ID,
      name: 'Forgery',
      hp: 1,
      max_hp: 1,
      ac: 1,
    });
    expect(error).not.toBeNull();
  });

  it('update_character rejects negative HP or HP exceeding max_hp', async () => {
    const { error: negError } = await player1.rpc('update_character', {
      p_character_id: ariaChar.id,
      p_hp: -1,
    });
    expect(negError).not.toBeNull();

    const { error: overError } = await player1.rpc('update_character', {
      p_character_id: ariaChar.id,
      p_hp: 999,
    });
    expect(overError).not.toBeNull();
  });

  it('update_character preserves name, max_hp, ac, and notes when updating only HP', async () => {
    const { data, error } = await player1.rpc('update_character', {
      p_character_id: ariaChar.id,
      p_hp: 15,
    });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.hp).toBe(15);
    expect(row.name).toBe('Aria the Rogue');
    expect(row.max_hp).toBe(25);
    expect(row.ac).toBe(16);
    expect(row.notes).toBe('DM adjusted');
  });

  it('direct DM update rejects HP below 0 or above max_hp via check constraint', async () => {
    const { error: negError } = await dm
      .from('characters')
      .update({ hp: -5 })
      .eq('id', goblinBoss.id);
    expect(negError).not.toBeNull();

    const { error: overError } = await dm
      .from('characters')
      .update({ hp: 50 })
      .eq('id', goblinBoss.id);
    expect(overError).not.toBeNull();
  });

  it('DM can update HP of any character in the room without modifying other fields', async () => {
    const { data, error } = await dm
      .from('characters')
      .update({ hp: 10 })
      .eq('id', ariaChar.id)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.hp).toBe(10);
    expect(data.name).toBe('Aria the Rogue');
    expect(data.max_hp).toBe(25);
    expect(data.ac).toBe(16);
    expect(data.notes).toBe('DM adjusted');
  });
});
