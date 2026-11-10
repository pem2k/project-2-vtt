export const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const ROLL_COMMAND_REGEX = /^(?:\/roll(?:\s+(.*))?|\/r(?:\s+(.*)|\s*$|(?=[0-9]|d|D)(.*)))$/i;

export function parseRollCommand(text) {
  if (typeof text !== 'string') {
    return { isCommand: false };
  }

  const match = text.trim().match(ROLL_COMMAND_REGEX);
  if (!match) {
    return { isCommand: false };
  }

  const arg = (match[1] ?? match[2] ?? match[3])?.trim();
  return {
    isCommand: true,
    notation: arg ? arg : null,
  };
}

export function emitRollDice(socket, roomId, notationOrDie, acknowledge) {
  const payload = { roomId };
  if (DICE_TYPES.includes(notationOrDie)) {
    payload.die = notationOrDie;
  } else {
    payload.notation = notationOrDie;
  }

  if (typeof acknowledge === 'function') {
    socket.emit('rollDice', payload, acknowledge);
  } else {
    socket.emit('rollDice', payload);
  }
}

export function formatRollMessage(roll) {
  if (!roll) return '';
  const name = roll.playerName || 'Player';
  const label = roll.notation || roll.die || 'dice';
  const total = roll.total ?? roll.result ?? '';

  if (Array.isArray(roll.rolls) && (roll.rolls.length > 1 || Boolean(roll.modifier))) {
    const modText = roll.modifier
      ? roll.modifier > 0
        ? ` + ${roll.modifier}`
        : ` - ${Math.abs(roll.modifier)}`
      : '';
    return `${name} rolled ${label}: ${total} (${roll.rolls.join(', ')}${modText})`;
  }

  return `${name} rolled ${label}: ${total}`;
}

export function appendRoll(list, roll, max = 20) {
  const next = [...list, roll];
  if (next.length <= max) {
    return next;
  }
  return next.slice(next.length - max);
}
