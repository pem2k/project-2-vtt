import { describe, expect, it, vi } from 'vitest';
import {
  DICE_TYPES,
  appendRoll,
  emitRollDice,
  formatRollMessage,
  parseRollCommand,
} from '../dice.js';

describe('dice library', () => {
  it('lists the seven standard dice', () => {
    expect(DICE_TYPES).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
  });

  it('emits rollDice with die when given a standard die name', () => {
    const socket = { emit: vi.fn() };

    emitRollDice(socket, 'room-42', 'd12');

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('rollDice', { roomId: 'room-42', die: 'd12' });
  });

  it('emits rollDice with notation and optional callback when given custom notation', () => {
    const socket = { emit: vi.fn() };
    const ack = vi.fn();

    emitRollDice(socket, 'room-42', '2d6+5', ack);

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(
      'rollDice',
      { roomId: 'room-42', notation: '2d6+5' },
      ack,
    );
  });

  describe('parseRollCommand', () => {
    it('detects /roll and extracts notation', () => {
      expect(parseRollCommand('/roll 2d6+5')).toEqual({
        isCommand: true,
        notation: '2d6+5',
      });
    });

    it('detects /r shorthand and extracts notation', () => {
      expect(parseRollCommand('/r 1d20-2')).toEqual({
        isCommand: true,
        notation: '1d20-2',
      });
    });

    it('is case-insensitive', () => {
      expect(parseRollCommand('/ROLL 3d8')).toEqual({
        isCommand: true,
        notation: '3d8',
      });
      expect(parseRollCommand('/R 4d6')).toEqual({
        isCommand: true,
        notation: '4d6',
      });
    });

    it('returns notation null when command is missing argument', () => {
      expect(parseRollCommand('/roll')).toEqual({
        isCommand: true,
        notation: null,
      });
      expect(parseRollCommand('/r    ')).toEqual({
        isCommand: true,
        notation: null,
      });
    });

    it('detects /r shorthand without space when followed by dice notation', () => {
      expect(parseRollCommand('/r2d6+5')).toEqual({
        isCommand: true,
        notation: '2d6+5',
      });
      expect(parseRollCommand('/rd20')).toEqual({
        isCommand: true,
        notation: 'd20',
      });
    });

    it('returns isCommand false for regular messages', () => {
      expect(parseRollCommand('hello world')).toEqual({
        isCommand: false,
      });
      expect(parseRollCommand('/other command')).toEqual({
        isCommand: false,
      });
      expect(parseRollCommand('/ready')).toEqual({
        isCommand: false,
      });
      expect(parseRollCommand('/rules')).toEqual({
        isCommand: false,
      });
    });
  });

  describe('formatRollMessage', () => {
    it('formats single die roll without modifier cleanly', () => {
      expect(formatRollMessage({ playerName: 'Aria', die: 'd20', result: 17 })).toBe(
        'Aria rolled d20: 17',
      );
    });

    it('formats multi-dice rolls with modifier, individual rolls, and total', () => {
      expect(
        formatRollMessage({
          playerName: 'Aria',
          notation: '2d6+5',
          rolls: [3, 4],
          modifier: 5,
          total: 12,
        }),
      ).toBe('Aria rolled 2d6+5: 12 (3, 4 + 5)');
    });

    it('formats single die roll with negative modifier', () => {
      expect(
        formatRollMessage({
          playerName: 'Borin',
          notation: '1d20-2',
          rolls: [15],
          modifier: -2,
          total: 13,
        }),
      ).toBe('Borin rolled 1d20-2: 13 (15 - 2)');
    });

    it('formats multi-dice rolls without modifier', () => {
      expect(
        formatRollMessage({
          playerName: 'Cyd',
          notation: '3d6',
          rolls: [2, 5, 1],
          modifier: 0,
          total: 8,
        }),
      ).toBe('Cyd rolled 3d6: 8 (2, 5, 1)');
    });
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
