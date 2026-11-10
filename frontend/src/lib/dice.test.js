import { describe, expect, it, vi } from 'vitest';
import { DICE_TYPES, appendRoll, emitRollDice } from './dice.js';

describe('dice library', () => {
  it('lists the seven standard dice', () => {
    expect(DICE_TYPES).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
  });

  it('emits rollDice with the room id and die, and no client-supplied name', () => {
    const socket = { emit: vi.fn() };

    emitRollDice(socket, 'room-42', 'd12');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('rollDice', { roomId: 'room-42', die: 'd12' });
  });

  it('appends a roll without mutating the original list', () => {
    const initial = [{ playerName: 'Aria', die: 'd6', result: 2 }];
    const snapshot = [...initial];
    const roll = { playerName: 'Borin', die: 'd20', result: 17 };

    const next = appendRoll(initial, roll);

    expect(next).toEqual([...initial, roll]);
    expect(next).not.toBe(initial);
    expect(initial).toEqual(snapshot);
  });

  it('drops the oldest rolls once the list passes max and keeps the newest', () => {
    const initial = [
      { playerName: 'A', die: 'd4', result: 1 },
      { playerName: 'B', die: 'd6', result: 2 },
      { playerName: 'C', die: 'd8', result: 3 },
    ];
    const roll = { playerName: 'D', die: 'd10', result: 4 };

    expect(appendRoll(initial, roll, 3)).toEqual([
      { playerName: 'B', die: 'd6', result: 2 },
      { playerName: 'C', die: 'd8', result: 3 },
      roll,
    ]);
    expect(initial).toHaveLength(3);
  });

  it('defaults max to 20', () => {
    const initial = Array.from({ length: 20 }, (_, index) => ({
      playerName: 'P',
      die: 'd6',
      result: index + 1,
    }));
    const roll = { playerName: 'Newest', die: 'd20', result: 20 };

    const next = appendRoll(initial, roll);

    expect(next).toHaveLength(20);
    expect(next[0]).toEqual(initial[1]);
    expect(next.at(-1)).toEqual(roll);
    expect(initial).toHaveLength(20);
  });
});
