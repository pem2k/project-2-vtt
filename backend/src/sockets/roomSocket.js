import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../utils/supabaseConfig.js';

export function registerSocketAuth(io, { createSupabaseClient = createClient } = {}) {
  const { url, anonKey } = getSupabaseConfig();

  io.use(async (socket, next) => {
    const accessToken = socket.handshake.auth?.accessToken;
    if (!accessToken) {
      next(new Error('Authentication required.'));
      return;
    }

    try {
      const client = createSupabaseClient(url, anonKey);
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) {
        next(new Error('Invalid access token.'));
        return;
      }

      socket.user = data.user;
      socket.accessToken = accessToken;
      next();
    } catch (error) {
      next(error);
    }
  });
}

export function registerJoinRoom(
  io,
  { createMembershipClient = createClient, logger = console.log } = {},
) {
  io.on('connection', (socket) => {
    socket.on('joinRoom', async (roomId, acknowledge = () => {}) => {
      try {
        const { url, anonKey } = getSupabaseConfig();
        const client = createMembershipClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${socket.accessToken}` } },
        });
        const { data, error } = await client
          .from('room_members')
          .select('room_id')
          .eq('room_id', roomId)
          .eq('user_id', socket.user.id)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          acknowledge({ ok: false, error: 'You are not a member of this room.' });
          return;
        }

        await socket.join(roomId);
        acknowledge({ ok: true });
      } catch (error) {
        logger(error);
        acknowledge({ ok: false, error: 'Unable to join room.' });
      }
    });
  });
}
