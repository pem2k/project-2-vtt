/**
 * Character card helpers (#13).
 * Validation plus Supabase reads/inserts. HP and notes editing is issue #14.
 */

/**
 * Validates character creation input.
 * @param {object} input
 * @param {string} input.name
 * @param {number} input.maxHp
 * @param {number} input.ac
 * @returns {string|null} Error message or null if valid
 */
export function validateCharacterInput({ name, maxHp, ac }) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    return 'Character name is required.';
  }
  if (trimmed.length > 40) {
    return 'Character name must be between 1 and 40 characters.';
  }
  if (!Number.isInteger(maxHp) || maxHp < 1) {
    return 'Max HP must be an integer of at least 1.';
  }
  if (!Number.isInteger(ac) || ac < 0) {
    return 'AC must be an integer of at least 0.';
  }
  return null;
}

/**
 * Fetches characters for a room ordered by created_at ascending.
 * @param {object} supabase
 * @param {string} roomId
 * @returns {Promise<Array>}
 */
export async function getRoomCharacters(supabase, roomId) {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Fetches the character owned by one user in a room.
 * @param {object} supabase
 * @param {string} roomId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getMyCharacter(supabase, roomId, userId) {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ?? null;
}

/**
 * Inserts a character with hp equal to maxHp and empty notes.
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.roomId
 * @param {string} params.userId
 * @param {string} params.name
 * @param {number} params.maxHp
 * @param {number} params.ac
 * @returns {Promise<object>} The inserted character record
 */
export async function createCharacter(supabase, { roomId, userId, name, maxHp, ac }) {
  const validationError = validateCharacterInput({ name, maxHp, ac });
  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await supabase
    .from('characters')
    .insert({
      room_id: roomId,
      user_id: userId,
      name: name.trim(),
      hp: maxHp,
      max_hp: maxHp,
      ac,
      notes: '',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}
