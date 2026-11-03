import { createClient } from '@supabase/supabase-js';

function getSupabaseConfig() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

export function registerSocketAuth(io, { createSupabaseClient = createClient } = {}) {
  io.use(async (socket, next) => {
    const accessToken = socket.handshake.auth?.accessToken;
    if (!accessToken) {
      next(new Error('Authentication required.'));
      return;
    }

    try {
      const { url, anonKey } = getSupabaseConfig();
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
  { createMembershipClient = createClient } = {},
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
        acknowledge({ ok: false, error: error.message || 'Unable to join room.' });
      }
    });
  });
}
