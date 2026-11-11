import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../utils/supabaseConfig.js';

function validateCharacterPayload(socket, payload) {
  const { roomId, characterId } = payload || {};
  if (
    typeof roomId !== 'string' ||
    !roomId.trim() ||
    typeof characterId !== 'string' ||
    !characterId.trim()
  ) {
    return { ok: false, error: 'Invalid payload.' };
  }

  if (!socket.rooms?.has(roomId)) {
    return { ok: false, error: 'Socket is not in room.' };
  }

  return { ok: true, roomId, characterId };
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

/**
 * Registers character events for the Socket.IO server (#14).
 * After persisting to Supabase, client emits 'characterUpdated' with { roomId, characterId }.
 * Server checks membership and ownership/DM permission, reads authoritative DB row,
 * and broadcasts it to all sockets in the room, including the sender.
 *
 * @param {import('socket.io').Server} io
 * @param {object} [options]
 * @param {Function} [options.createUserClient]
 */
export function registerCharacterEvents(io, { createUserClient = createClient } = {}) {
  io.on('connection', (socket) => {
    socket.on('characterUpdated', async (payload, acknowledge = () => {}) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const valid = validateCharacterPayload(socket, payload);
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
        const { roomId, characterId } = valid;

        const { data: characterRow, error: charError } = await client
          .from('characters')
          .select('*')
          .eq('id', characterId)
          .eq('room_id', roomId)
          .maybeSingle();

        if (charError || !characterRow) {
          ack({ ok: false, error: 'Character not found.' });
          return;
        }

        const isDm = member.role === 'dm';
        const isOwner = Boolean(characterRow.user_id && characterRow.user_id === socket.user?.id);

        if (!isDm && !isOwner) {
          ack({ ok: false, error: 'Not authorized to update this character.' });
          return;
        }

        io.to(roomId).emit('characterUpdated', characterRow);
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: error.message || 'Unable to process character update.' });
      }
    });
  });
}
