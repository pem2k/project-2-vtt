/**
 * Token palette from Docs/design.md.
 * 8 distinct high-contrast colors with human-readable names for accessibility.
 */
export const TOKEN_COLORS = [
  { name: 'Red', hex: '#E6194B' },
  { name: 'Blue', hex: '#4363D8' },
  { name: 'Green', hex: '#3CB44B' },
  { name: 'Orange', hex: '#F58231' },
  { name: 'Purple', hex: '#911EB4' },
  { name: 'Teal', hex: '#469990' },
  { name: 'Yellow', hex: '#FFE119' },
  { name: 'Pink', hex: '#F032E6' },
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validates token creation input.
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.color
 * @returns {string|null} Error message or null if valid
 */
export function validateTokenInput({ name, color }) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    return 'Token name is required.';
  }
  if (trimmed.length > 40) {
    return 'Token name must be between 1 and 40 characters.';
  }
  if (!color || !HEX_COLOR_REGEX.test(color)) {
    return 'Color must be a valid 6-digit hex code.';
  }
  return null;
}

/**
 * Pure immutable list helper: adds a token or replaces it if id already exists.
 * @param {Array} list
 * @param {object} token
 * @returns {Array} New list
 */
export function upsertToken(list = [], token) {
  if (!token?.id) return list;
  const index = list.findIndex((item) => item.id === token.id);
  if (index === -1) {
    return [...list, token];
  }
  const next = [...list];
  next[index] = token;
  return next;
}

/**
 * Pure immutable list helper: removes a token by id.
 * @param {Array} list
 * @param {string} id
 * @returns {Array} New list
 */
export function removeTokenById(list = [], id) {
  return list.filter((item) => item.id !== id);
}

/**
 * Reconciles an authoritative tokens snapshot with socket events
 * that arrived while the snapshot request was in flight.
 *
 * @param {Array} snapshotTokens
 * @param {Array<{ type: string, token?: object, id?: string }>} pendingEvents
 * @returns {Array} Reconciled tokens list
 */
export function reconcileTokens(snapshotTokens = [], pendingEvents = []) {
  let result = [...snapshotTokens];
  for (const event of pendingEvents) {
    if (event.type === 'tokenAdded' || event.type === 'tokenUpdated') {
      if (event.token) {
        result = upsertToken(result, event.token);
      }
    } else if (event.type === 'tokenRemoved') {
      if (event.id) {
        result = removeTokenById(result, event.id);
      }
    }
  }
  return result;
}

/**
 * Fetches tokens for a room ordered by created_at ascending.
 * @param {object} supabase
 * @param {string} roomId
 * @returns {Promise<Array>}
 */
export async function getRoomTokens(supabase, roomId) {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Inserts a new token into the tokens table.
 * Defaults x: 0, y: 0 in grid cell coordinates.
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.roomId
 * @param {string} params.name
 * @param {string} params.color
 * @returns {Promise<object>} The inserted token record
 */
export async function addToken(supabase, { roomId, name, color }) {
  const validationError = validateTokenInput({ name, color });
  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await supabase
    .from('tokens')
    .insert({
      room_id: roomId,
      name: name.trim(),
      color,
      x: 0,
      y: 0,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Deletes a token by id.
 * @param {object} supabase
 * @param {string} tokenId
 * @returns {Promise<void>}
 */
export async function removeToken(supabase, tokenId) {
  const { error } = await supabase.from('tokens').delete().eq('id', tokenId);
  if (error) {
    throw error;
  }
}

/**
 * Assigns or unassigns a token to a user.
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.tokenId
 * @param {string|null} [params.userId]
 * @returns {Promise<object>} The updated token record
 */
export async function assignToken(supabase, { tokenId, userId }) {
  const { data, error } = await supabase
    .from('tokens')
    .update({ assigned_to: userId ?? null })
    .eq('id', tokenId)
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}
