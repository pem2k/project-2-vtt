import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../utils/supabaseConfig.js';

const settingsEvents = {
  gridUpdated: {
    fields: 'id, grid_visible, grid_cell_size',
    payload: (room) => room,
  },
  mapUpdated: {
    fields: 'id, active_map:maps!rooms_active_map_id_fkey(*)',
    payload: (room) => ({ roomId: room.id, map: room.active_map }),
  },
};

export function registerRoomSettingsEvents(io, { createUserClient = createClient } = {}) {
  io.on('connection', (socket) => {
    // Both notifications share the same DM authorization and authoritative read.
    for (const [event, settings] of Object.entries(settingsEvents)) {
      socket.on(event, async (payload, acknowledge) => {
        const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
        const roomId = payload?.roomId;
        if (typeof roomId !== 'string' || !roomId.trim() || !socket.rooms.has(roomId)) {
          ack({ ok: false, error: 'Invalid room.' });
          return;
        }
        try {
          const { url, anonKey } = getSupabaseConfig();
          const client = createUserClient(url, anonKey, {
            global: { headers: { Authorization: `Bearer ${socket.accessToken}` } },
          });
          const { data: member, error: memberError } = await client
            .from('room_members')
            .select('role')
            .eq('room_id', roomId)
            .eq('user_id', socket.user.id)
            .maybeSingle();
          if (memberError || member?.role !== 'dm') {
            ack({ ok: false, error: 'Only the DM can broadcast room settings.' });
            return;
          }
          const { data: room, error } = await client
            .from('rooms')
            .select(settings.fields)
            .eq('id', roomId)
            .maybeSingle();
          if (error || !room) throw new Error('Room settings unavailable.');
          io.to(roomId).emit(event, settings.payload(room));
          ack({ ok: true });
        } catch {
          ack({ ok: false, error: 'Unable to broadcast room settings.' });
        }
      });
    }
  });
}
