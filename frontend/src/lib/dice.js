export const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export function emitRollDice(socket, roomId, die) {
  socket.emit('rollDice', { roomId, die });
}

export function appendRoll(list, roll, max = 20) {
  const next = [...list, roll];
  if (next.length <= max) {
    return next;
  }
  return next.slice(next.length - max);
}
