/**
 * Character card helpers (#13).
 * Validation plus Supabase reads/inserts. HP and notes editing is issue #14.
 */

/**
 * Validation messages returned by character input validators.
 */
export const CHARACTER_VALIDATION_MESSAGES = {
  NAME_REQUIRED: 'Character name is required.',
  NAME_LENGTH: 'Character name must be between 1 and 40 characters.',
  MAX_HP_INTEGER: 'Max HP must be an integer of at least 1.',
  AC_INTEGER: 'AC must be an integer of at least 0.',
  CURRENT_HP_REQUIRED: 'Current HP is required.',
  CURRENT_HP_INTEGER: 'Current HP must be an integer.',
  HP_INTEGER: 'HP must be an integer of at least 0.',
};

export const CHARACTER_VALIDATION_SET = new Set(Object.values(CHARACTER_VALIDATION_MESSAGES));

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
    return CHARACTER_VALIDATION_MESSAGES.NAME_REQUIRED;
  }
  if (trimmed.length > 40) {
    return CHARACTER_VALIDATION_MESSAGES.NAME_LENGTH;
  }
  if (!Number.isInteger(maxHp) || maxHp < 1) {
    return CHARACTER_VALIDATION_MESSAGES.MAX_HP_INTEGER;
  }
  if (!Number.isInteger(ac) || ac < 0) {
    return CHARACTER_VALIDATION_MESSAGES.AC_INTEGER;
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

/**
 * Validates HP input for the HP editor.
 * @param {string|number} hp
 * @param {number} maxHp
 * @returns {string|null}
 */
export function validateHpInput(hp, maxHp) {
  if (hp === undefined || hp === null) {
    return CHARACTER_VALIDATION_MESSAGES.CURRENT_HP_REQUIRED;
  }
  const str = String(hp).trim();
  if (str === '') {
    return CHARACTER_VALIDATION_MESSAGES.CURRENT_HP_REQUIRED;
  }
  if (!/^-?\d+$/.test(str)) {
    return CHARACTER_VALIDATION_MESSAGES.CURRENT_HP_INTEGER;
  }
  const parsed = Number.parseInt(str, 10);
  if (!Number.isInteger(parsed)) {
    return CHARACTER_VALIDATION_MESSAGES.CURRENT_HP_INTEGER;
  }
  if (parsed < 0 || (typeof maxHp === 'number' && parsed > maxHp)) {
    return `Current HP must be between 0 and ${maxHp}.`;
  }
  return null;
}

/**
 * Updates a character's HP via update_character RPC for players or direct UPDATE for DMs.
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.characterId
 * @param {number} params.hp
 * @param {boolean} [params.isDM=false]
 * @returns {Promise<object>} The updated character record
 */
export async function updateCharacterHp(supabase, { characterId, hp, isDM = false }) {
  if (!Number.isInteger(hp) || hp < 0) {
    throw new Error(CHARACTER_VALIDATION_MESSAGES.HP_INTEGER);
  }

  if (isDM) {
    const { data, error } = await supabase
      .from('characters')
      .update({ hp })
      .eq('id', characterId)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  const { data, error } = await supabase.rpc('update_character', {
    p_character_id: characterId,
    p_hp: hp,
  });

  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Pure immutable list helper: adds a character or replaces it if id already exists.
 * @param {Array} list
 * @param {object} character
 * @returns {Array} New list
 */
export function upsertCharacter(list = [], character) {
  if (!character?.id) return list;
  const index = list.findIndex((item) => item.id === character.id);
  if (index === -1) {
    return [...list, character];
  }
  const next = [...list];
  next[index] = character;
  return next;
}

/**
 * Reconciles snapshot character records with events buffered during an in-flight reload.
 * @param {Array} snapshotCharacters
 * @param {Array} bufferedEvents
 * @returns {Array}
 */
export function reconcileCharacters(snapshotCharacters = [], bufferedEvents = []) {
  let result = [...snapshotCharacters];
  for (const event of bufferedEvents) {
    if (event?.type === 'characterUpdated' && event.character?.id) {
      result = upsertCharacter(result, event.character);
    }
  }
  return result;
}

/**
 * Emits characterUpdated event to the Socket.IO server with a bounded acknowledgement timeout.
 * @param {import('socket.io-client').Socket} socket
 * @param {object} payload
 * @param {string} payload.roomId
 * @param {string} payload.characterId
 * @param {object} [options]
 * @param {number} [options.timeout=5000]
 * @returns {Promise<object>}
 */
export function emitCharacterUpdated(socket, { roomId, characterId }, { timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket is not connected.'));
      return;
    }

    let settled = false;
    let timer = null;

    if (timeout > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out waiting for server to broadcast character update.'));
      }, timeout);
    }

    socket.emit('characterUpdated', { roomId, characterId }, (response) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);

      if (response && response.ok === false) {
        reject(new Error(response.error || 'Failed to broadcast character update.'));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Fixed user-friendly copy for known database errors, constraints, and RPC failures.
 */
export const KNOWN_CHARACTER_ERRORS = {
  ONE_PER_PLAYER: 'You already have a character in this room.',
  ROOM_MEMBER_REQUIRED: 'You must be a member of this room to create a character.',
  HP_RANGE_INVALID: 'HP must be between 0 and max HP.',
  NOT_OWNER: 'You can only edit your own character.',
  NOT_FOUND: 'Character not found.',
};

/**
 * Maps known character validation and database errors into fixed, friendly copy.
 * Unrecognized errors return the caller-provided fallback without echoing raw database details.
 *
 * @param {unknown} error
 * @param {string} [fallback='Unable to complete character action.']
 * @returns {string}
 */
export function toFriendlyCharacterError(error, fallback = 'Unable to complete character action.') {
  const message =
    typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : '';
  const code = typeof error?.code === 'string' ? error.code : '';

  // 1. Explicit application validation messages
  if (CHARACTER_VALIDATION_SET.has(message)) {
    return message;
  }
  if (/^Current HP must be between 0 and \d+\.$/.test(message)) {
    return message;
  }

  // 2. Known database error codes and constraints
  if (
    code === '23514' ||
    /characters_hp_range/i.test(message) ||
    /hp must be between 0 and max_hp/i.test(message)
  ) {
    return KNOWN_CHARACTER_ERRORS.HP_RANGE_INVALID;
  }

  // 3. Known trigger & RPC exceptions
  if (/already (has|have) a character/i.test(message)) {
    return KNOWN_CHARACTER_ERRORS.ONE_PER_PLAYER;
  }
  if (/not a member/i.test(message)) {
    return KNOWN_CHARACTER_ERRORS.ROOM_MEMBER_REQUIRED;
  }
  if (/not allowed to edit this character/i.test(message)) {
    return KNOWN_CHARACTER_ERRORS.NOT_OWNER;
  }
  if (/character not found/i.test(message)) {
    return KNOWN_CHARACTER_ERRORS.NOT_FOUND;
  }

  return fallback;
}
