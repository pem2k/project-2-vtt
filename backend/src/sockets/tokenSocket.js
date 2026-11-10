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

async function getRoomMemberClient(socket, roomId, createUserClient) {
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

  if (memberError || !member) {
    return { ok: false, error: 'You are not a member of this room.' };
  }

  return { ok: true, client, member };
}

async function authorizeDmTokenEvent(socket, roomId, createUserClient) {
  const memberResult = await getRoomMemberClient(socket, roomId, createUserClient);
  if (!memberResult.ok || memberResult.member?.role !== 'dm') {
    return { ok: false, error: 'Only DMs can manage tokens.' };
  }

  return { ok: true, client: memberResult.client };
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
  io.on('connection', (socket) => {
    socket.on('tokenAdded', async (payload, acknowledge = () => {}) => {
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

        const { client } = authz;
        const { roomId, tokenId } = valid;
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

        const { client } = authz;
        const { roomId, tokenId } = valid;
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

    socket.on('tokenUpdated', async (payload, acknowledge = () => {}) => {
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

        const { client } = authz;
        const { roomId, tokenId } = valid;
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

        socket.to(roomId).emit('tokenUpdated', tokenRow);
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message || 'Unable to process tokenUpdated.' });
      }
    });

    socket.on('moveToken', async (payload, acknowledge = () => {}) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const valid = validateTokenPayload(socket, payload);
        if (!valid.ok) {
          ack({ ok: false, error: valid.error });
          return;
        }

        const memberResult = await getRoomMemberClient(socket, valid.roomId, createUserClient);
        if (!memberResult.ok) {
          ack({ ok: false, error: memberResult.error });
          return;
        }

        const { client, member } = memberResult;
        const { roomId, tokenId } = valid;

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

        const isDm = member.role === 'dm';
        const isAssigned = Boolean(
          tokenRow.assigned_to && tokenRow.assigned_to === socket.user?.id,
        );

        if (!isDm && !isAssigned) {
          ack({ ok: false, error: 'Not authorized to move this token.' });
          return;
        }

        io.to(roomId).emit('tokenMoved', tokenRow);
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message || 'Unable to process moveToken.' });
      }
    });
  });
}
