const ALLOWED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);
const NOTATION_REGEX = /^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/i;

export function parseDiceNotation(notation) {
  if (typeof notation !== 'string') {
    throw new Error('Invalid dice notation.');
  }

  const trimmed = notation.trim();
  const match = trimmed.match(NOTATION_REGEX);
  if (!match) {
    throw new Error('Invalid dice notation.');
  }

  const rawCount = match[1];
  const rawSides = match[2];
  const sign = match[3];
  const rawMod = match[4];

  const count = rawCount === '' ? 1 : Number(rawCount);
  const sides = Number(rawSides);

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('Invalid dice notation.');
  }

  if (!ALLOWED_SIDES.has(sides)) {
    throw new Error('Invalid dice notation.');
  }

  let modifier = 0;
  if (sign && rawMod !== undefined) {
    const modValue = Number(rawMod);
    if (!Number.isInteger(modValue)) {
      throw new Error('Invalid dice notation.');
    }
    modifier = sign === '-' ? -modValue : modValue;
  }

  const canonicalModifier = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : '';
  const canonicalNotation = `${count}d${sides}${canonicalModifier}`;

  return {
    count,
    sides,
    modifier,
    notation: canonicalNotation,
  };
}

export function rollDice(input) {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 1) {
      throw new Error('Dice sides must be a positive integer.');
    }

    return Math.floor(Math.random() * input) + 1;
  }

  const spec = typeof input === 'object' && input !== null ? input : parseDiceNotation(input);
  const { count, sides, modifier = 0, notation } = spec;

  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(sides) || sides < 1) {
    throw new Error('Invalid dice specification.');
  }

  const rolls = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
    sum += roll;
  }

  return {
    notation,
    count,
    sides,
    rolls,
    modifier,
    total: sum + modifier,
  };
}
