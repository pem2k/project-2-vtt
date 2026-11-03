export function rollDice(sides) {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new Error('Dice sides must be a positive integer.');
  }

  return Math.floor(Math.random() * sides) + 1;
}
