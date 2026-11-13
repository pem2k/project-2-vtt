import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gridLib from '../../lib/roomGrid.js';
import * as charactersLib from '../../lib/characters.js';
import * as tokensLib from '../../lib/tokens.js';
import { createGamePageHarness, deferred } from '../../test/gamePageHarness.jsx';

let settings;
let board;
vi.mock('../../components/SettingsPanel.jsx', () => ({
  default: (props) => {
    settings = props;
    return null;
  },
}));
vi.mock('../../components/board/Board.jsx', () => ({
  default: (props) => {
    board = props;
    return null;
  },
}));
vi.mock('../../components/ChatPanel.jsx', () => ({ default: () => null }));

describe('shared room grid', () => {
  let harness;
  const saved = { id: 'room-123', grid_visible: false, grid_cell_size: 75 };
  beforeEach(() => {
    harness = createGamePageHarness();
    harness.setupMockRoomSocket();
    harness.mockAuthenticatedGame({ role: 'dm' });
    vi.spyOn(charactersLib, 'getRoomCharacters').mockResolvedValue([]);
    vi.spyOn(tokensLib, 'getRoomTokens').mockResolvedValue([]);
    vi.spyOn(gridLib, 'getRoomGrid').mockResolvedValue(saved);
  });
  afterEach(async () => {
    await harness.cleanup();
  });

  it('loads on join, applies broadcasts, and restores missed updates on reconnect', async () => {
    harness.mockAuthenticatedGame({ role: 'player' });
    vi.spyOn(charactersLib, 'getMyCharacter').mockResolvedValue(null);
    gridLib.getRoomGrid.mockResolvedValue(saved);
    await harness.render();
    expect(board).toMatchObject({ showGrid: false, cellSize: 75 });
    await act(async () => harness.triggerSocket('gridUpdated', { ...saved, grid_visible: true }));
    expect(board.showGrid).toBe(true);
    await act(async () => {
      await harness.triggerOnJoined();
    });
    expect(board).toMatchObject({ showGrid: false, cellSize: 75 });
  });

  it('preserves a newer broadcast while a reconnect snapshot is in flight', async () => {
    await harness.render();
    const snapshot = deferred();
    gridLib.getRoomGrid.mockReturnValueOnce(snapshot.promise);
    await act(async () => {
      harness.triggerOnJoined();
    });
    await act(async () => harness.triggerSocket('gridUpdated', { ...saved, grid_cell_size: 100 }));
    await act(async () => {
      snapshot.resolve(saved);
      await snapshot.promise;
    });
    expect(board.cellSize).toBe(100);
  });

  it('previews slider changes locally, saves once on completion, and broadcasts after saving', async () => {
    await harness.render();
    const write = deferred();
    const save = vi.spyOn(gridLib, 'setRoomGrid').mockReturnValue(write.promise);
    const notify = vi.spyOn(gridLib, 'emitGridUpdated').mockResolvedValue();
    await act(async () => settings.onChangeGridCellSize(90));
    expect(board.cellSize).toBe(90);
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      settings.onCommitGridCellSize(90);
    });
    expect(notify).not.toHaveBeenCalled();
    await act(async () => {
      write.resolve({ ...saved, grid_cell_size: 90 });
      await write.promise;
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(harness.mockSocket, 'room-123');
    await act(async () => {
      await settings.onCommitGridCellSize(90);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved grid and reports a failed write', async () => {
    await harness.render();
    vi.spyOn(gridLib, 'setRoomGrid').mockRejectedValue(new Error('write failed'));
    await act(async () => {
      await settings.onToggleGrid();
    });
    expect(board.showGrid).toBe(false);
    expect(harness.container.querySelector('[role="alert"]').textContent).toContain('save grid');
  });

  it('keeps a successful save when broadcasting fails', async () => {
    await harness.render();
    const save = vi
      .spyOn(gridLib, 'setRoomGrid')
      .mockResolvedValue({ ...saved, grid_visible: true });
    vi.spyOn(gridLib, 'emitGridUpdated').mockRejectedValue(new Error('disconnected'));
    await act(async () => {
      await settings.onToggleGrid();
    });
    expect(save).toHaveBeenCalledWith(expect.anything(), {
      roomId: 'room-123',
      visible: true,
      cellSize: 75,
    });
    expect(board.showGrid).toBe(true);
    expect(harness.container.querySelector('[role="alert"]').textContent).toContain('Grid saved');
  });

  it('ignores an old room save after navigation, including a return to that room', async () => {
    await harness.render();
    const write = deferred();
    vi.spyOn(gridLib, 'setRoomGrid').mockReturnValue(write.promise);
    const notify = vi.spyOn(gridLib, 'emitGridUpdated').mockResolvedValue();
    await act(async () => {
      settings.onToggleGrid();
    });
    await harness.navigate('/game/other-room');
    await harness.navigate('/game/room-123');
    await act(async () => {
      write.resolve({ ...saved, grid_visible: true });
      await write.promise;
    });
    expect(board.showGrid).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
