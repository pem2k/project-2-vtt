import { rollDice } from '../utils/dice.js';

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
  const { roomId, die } = payload || {};
  if (typeof roomId !== 'string' || !roomId.trim()) {
    return { ok: false, error: 'Invalid payload.' };
  }

  if (!ALLOWED_DICE.has(die)) {
    return { ok: false, error: 'Invalid die.' };
  }

  if (!socket.rooms?.has(roomId)) {
    return { ok: false, error: 'Socket is not in room.' };
  }

  return { ok: true, roomId, die };
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

        const sides = Number(valid.die.slice(1));
        const result = rollDice(sides);
        io.to(valid.roomId).emit('diceResult', {
          roomId: valid.roomId,
          playerName: playerNameFromUser(socket.user),
          die: valid.die,
          result,
        });
        ack({ ok: true });
      } catch {
        ack({ ok: false, error: 'Unable to roll dice.' });
      }
    });
  });
}
