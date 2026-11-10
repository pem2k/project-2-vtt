import { parseDiceNotation, rollDice } from '../utils/dice.js';

const ALLOWED_DICE = new Set(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);

function playerNameFromUser(user) {
  const username = user?.user_metadata?.username;
  if (typeof username === 'string' && username.length > 0) {
    return username;
  }

  const email = user?.email;
  if (typeof email === 'string') {
    const localPart = email.split('@')[0];
    if (localPart) {
      return localPart;
    }
  }

  return 'Player';
}

function validateRoll(socket, payload) {
  const { roomId } = payload || {};
  if (typeof roomId !== 'string' || !roomId.trim()) {
    return { ok: false, error: 'Invalid payload.' };
  }

  if (!socket.rooms?.has(roomId)) {
    return { ok: false, error: 'Socket is not in room.' };
  }

  if (payload.notation !== undefined) {
    if (typeof payload.notation !== 'string' || !payload.notation.trim()) {
      return { ok: false, error: 'Invalid dice notation.' };
    }
    try {
      const parsed = parseDiceNotation(payload.notation);
      return {
        ok: true,
        roomId,
        spec: parsed,
        isCustomNotation: true,
      };
    } catch {
      return { ok: false, error: 'Invalid dice notation.' };
    }
  }

  if (!ALLOWED_DICE.has(payload.die)) {
    return { ok: false, error: 'Invalid die.' };
  }

  const sides = Number(payload.die.slice(1));
  return {
    ok: true,
    roomId,
    spec: {
      count: 1,
      sides,
      modifier: 0,
      notation: payload.die,
      die: payload.die,
    },
    isCustomNotation: false,
  };
}

/**
 * Registers dice events for the Socket.IO server.
 * A member emits 'rollDice'; the server rolls, names the player from the
 * authenticated user, and broadcasts 'diceResult' to every socket in the room.
 *
 * @param {import('socket.io').Server} io
 */
export function registerDiceEvents(io) {
  io.on('connection', (socket) => {
    socket.on('rollDice', (payload, acknowledge) => {
      const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const valid = validateRoll(socket, payload);
        if (!valid.ok) {
          ack({ ok: false, error: valid.error });
          return;
        }

        const roll = rollDice(valid.spec);
        const broadcastPayload = {
          roomId: valid.roomId,
          playerName: playerNameFromUser(socket.user),
          die: valid.spec.die || roll.notation,
          result: roll.total,
          ...(valid.isCustomNotation && {
            notation: roll.notation,
            rolls: roll.rolls,
            modifier: roll.modifier,
            total: roll.total,
          }),
        };

        io.to(valid.roomId).emit('diceResult', broadcastPayload);
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Unable to roll dice.' });
      }
    });
  });
}
