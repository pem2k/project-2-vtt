import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../utils/supabaseConfig.js';

function validateTokenPayload(socket, payload) {
  const { roomId, tokenId } = payload || {};
  if (
    typeof roomId !== 'string' ||
    !roomId.trim() ||
    typeof tokenId !== 'string' ||
    !tokenId.trim()
  ) {
    return { ok: false, error: 'Invalid payload.' };
  }

  if (!socket.rooms?.has(roomId)) {
    return { ok: false, error: 'Socket is not in room.' };
  }

  return { ok: true, roomId, tokenId };
}

async function authorizeDmTokenEvent(socket, roomId, createUserClient) {
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
    return { ok: false, error: 'Only DMs can manage tokens.' };
  }

  return { ok: true, client };
}

async function verifyTokenPresent(client, roomId, tokenId) {
  const { data: tokenRow, error: tokenError } = await client
    .from('tokens')
    .select('*')
    .eq('id', tokenId)
    .eq('room_id', roomId)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return { ok: false, error: 'Token not found.' };
  }

  return { ok: true, payload: tokenRow };
}

async function verifyTokenRemoved(client, roomId, tokenId) {
  const { data: existingToken, error: checkError } = await client
    .from('tokens')
    .select('id')
    .eq('id', tokenId)
    .eq('room_id', roomId)
    .maybeSingle();

  if (checkError) {
    return { ok: false, error: checkError.message };
  }

  if (existingToken) {
    return { ok: false, error: 'Token still exists.' };
  }

  return { ok: true, payload: { id: tokenId } };
}

/**
 * Registers token events for the Socket.IO server.
 * DM emits 'tokenAdded', 'tokenRemoved', or 'tokenUpdated' after persistent write;
 * server validates DM role and DB row state, then broadcasts to other sockets in the room.
 *
 * @param {import('socket.io').Server} io
 * @param {object} [options]
 * @param {Function} [options.createUserClient]
 */
export function registerTokenEvents(io, { createUserClient = createClient } = {}) {
  function handleTokenEvent(socket, eventName, verifyAndBuildPayload) {
    socket.on(eventName, async (payload, acknowledge = () => {}) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const valid = validateTokenPayload(socket, payload);
        if (!valid.ok) {
          ack({ ok: false, error: valid.error });
          return;
        }

        const authz = await authorizeDmTokenEvent(socket, valid.roomId, createUserClient);
        if (!authz.ok) {
          ack({ ok: false, error: authz.error });
          return;
        }

        const verified = await verifyAndBuildPayload(authz.client, valid.roomId, valid.tokenId);
        if (!verified.ok) {
          ack({ ok: false, error: verified.error });
          return;
        }

        socket.to(valid.roomId).emit(eventName, verified.payload);
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message || `Unable to process ${eventName}.` });
      }
    });
  }

  io.on('connection', (socket) => {
    handleTokenEvent(socket, 'tokenAdded', verifyTokenPresent);
    handleTokenEvent(socket, 'tokenRemoved', verifyTokenRemoved);
    handleTokenEvent(socket, 'tokenUpdated', verifyTokenPresent);
  });
}
