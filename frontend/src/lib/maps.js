/**
 * Map upload validation and helper utilities (#7).
 */

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/jpg']);

/**
 * Validates whether the selected file is a valid image.
 * @param {File|{type: string, name: string}} file
 * @returns {string|null} Error message or null if valid.
 */
export function validateMapFile(file) {
  if (!file) {
    return 'Please select an image file to upload.';
  }

  const mimeType = file.type?.toLowerCase();
  if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return 'Invalid file type. Only image files (PNG, JPG, WebP) are allowed.';
  }

  return null;
}

/**
 * Uploads a map image to Supabase Storage and records it in public.maps.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ roomId: string, file: File, mapName?: string }} params
 * @returns {Promise<Object>} The inserted map record.
 */
export async function uploadMap(supabase, { roomId, file, mapName }) {
  const validationError = validateMapFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const filePath = `${roomId}/${fileName}`;

  // 1. Upload to Supabase Storage in bucket 'maps'
  const { error: uploadError } = await supabase.storage.from('maps').upload(filePath, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  // 2. Obtain Public URL
  const { data: urlData } = supabase.storage.from('maps').getPublicUrl(filePath);

  const finalUrl = urlData.publicUrl;
  const displayName = mapName?.trim() || file.name.replace(/\.[^/.]+$/, '');

  // 3. Insert record into public.maps
  const { data: mapRecord, error: dbError } = await supabase
    .from('maps')
    .insert({
      room_id: roomId,
      name: displayName,
      url: finalUrl,
    })
    .select()
    .single();

  if (dbError) {
    throw dbError;
  }

  return mapRecord;
}

/**
 * Fetches the active map for a room.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<Object|null>} The active map record or null.
 */
export async function getActiveMap(supabase, roomId) {
  // Join rooms with active_map_id
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('active_map_id')
    .eq('id', roomId)
    .single();

  if (roomError) {
    throw roomError;
  }

  if (!room?.active_map_id) {
    return null;
  }

  const { data: map, error: mapError } = await supabase
    .from('maps')
    .select('*')
    .eq('id', room.active_map_id)
    .single();

  if (mapError) {
    throw mapError;
  }

  return map;
}

/**
 * Fetches all uploaded maps for a room.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<Array<Object>>}
 */
export async function getRoomMaps(supabase, roomId) {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Sets the active map for a room.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ roomId: string, mapId: string }} params
 */
export async function setActiveMap(supabase, { roomId, mapId }) {
  const { data, error } = await supabase.rpc('set_active_map', {
    p_room_id: roomId,
    p_map_id: mapId,
  });

  if (error) {
    throw error;
  }

  const room = Array.isArray(data) ? data[0] : data;
  if (!room) {
    throw new Error('Active map was not updated.');
  }

  return room;
}
