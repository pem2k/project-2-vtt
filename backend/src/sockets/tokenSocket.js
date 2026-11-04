import { createClient } from '@supabase/supabase-js';

function getSupabaseConfig() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

/**
 * Registers token events for the Socket.IO server.
 * DM emits 'tokenAdded' or 'tokenRemoved' after persistent write;
 * server validates DM role and DB row state, then broadcasts to other sockets in the room.
 *
 * @param {import('socket.io').Server} io
 * @param {object} [options]
 * @param {Function} [options.createUserClient]
 */
export function registerTokenEvents(io, { createUserClient = createClient } = {}) {
  io.on('connection', (socket) => {
    socket.on('tokenAdded', async (payload, acknowledge = () => {}) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const { roomId, tokenId } = payload || {};
        if (
          typeof roomId !== 'string' ||
          !roomId.trim() ||
          typeof tokenId !== 'string' ||
          !tokenId.trim()
        ) {
          ack({ ok: false, error: 'Invalid payload.' });
          return;
        }

        if (!socket.rooms?.has(roomId)) {
          ack({ ok: false, error: 'Socket is not in room.' });
          return;
        }

        const { url, anonKey } = getSupabaseConfig();
        const client = createUserClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${socket.accessToken}` } },
        });

        const { data: member, error: memberError } = await client
          .from('room_members')
          .select('role')
          .eq('room_id', roomId)
          .eq('user_id', socket.user?.id)
          .maybeSingle();

        if (memberError || member?.role !== 'dm') {
          ack({ ok: false, error: 'Only DMs can manage tokens.' });
          return;
        }

        const { data: tokenRow, error: tokenError } = await client
          .from('tokens')
          .select('*')
          .eq('id', tokenId)
          .eq('room_id', roomId)
          .maybeSingle();

        if (tokenError || !tokenRow) {
          ack({ ok: false, error: 'Token not found.' });
          return;
        }

        socket.to(roomId).emit('tokenAdded', tokenRow);
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message || 'Unable to process tokenAdded.' });
      }
    });

    socket.on('tokenRemoved', async (payload, acknowledge = () => {}) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const { roomId, tokenId } = payload || {};
        if (
          typeof roomId !== 'string' ||
          !roomId.trim() ||
          typeof tokenId !== 'string' ||
          !tokenId.trim()
        ) {
          ack({ ok: false, error: 'Invalid payload.' });
          return;
        }

        if (!socket.rooms?.has(roomId)) {
          ack({ ok: false, error: 'Socket is not in room.' });
          return;
        }

        const { url, anonKey } = getSupabaseConfig();
        const client = createUserClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${socket.accessToken}` } },
        });

        const { data: member, error: memberError } = await client
          .from('room_members')
          .select('role')
          .eq('room_id', roomId)
          .eq('user_id', socket.user?.id)
          .maybeSingle();

        if (memberError || member?.role !== 'dm') {
          ack({ ok: false, error: 'Only DMs can manage tokens.' });
          return;
        }

        const { data: existingToken, error: checkError } = await client
          .from('tokens')
          .select('id')
          .eq('id', tokenId)
          .eq('room_id', roomId)
          .maybeSingle();

        if (checkError) {
          ack({ ok: false, error: checkError.message });
          return;
        }

        if (existingToken) {
          ack({ ok: false, error: 'Token still exists.' });
          return;
        }

        socket.to(roomId).emit('tokenRemoved', { id: tokenId });
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message || 'Unable to process tokenRemoved.' });
      }
    });
  });
}
