import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerRoomSettingsEvents } from '../src/sockets/roomSettingsSocket.js';

function setup({ role = 'dm', joined = true, roomError = null, event = 'gridUpdated' } = {}) {
  const io = new EventEmitter();
  const broadcast = vi.fn();
  io.to = vi.fn(() => ({ emit: broadcast }));
  const socket = new EventEmitter();
  socket.user = { id: 'user-1' };
  socket.accessToken = 'test-jwt';
  socket.rooms = new Set(joined ? ['room-1'] : []);
  const grid = { id: 'room-1', grid_visible: false, grid_cell_size: 75 };
  const map = { id: 'map-1', room_id: 'room-1', url: 'https://map.png' };
  const room = event === 'gridUpdated' ? grid : { id: 'room-1', active_map: map };
  const client = {
    from: vi.fn((table) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi
          .fn()
          .mockResolvedValue(
            table === 'room_members'
              ? { data: role ? { role } : null }
              : { data: roomError ? null : room, error: roomError },
          ),
      };
      return query;
    }),
  };
  registerRoomSettingsEvents(io, { createUserClient: () => client });
  io.emit('connection', socket);
  const notify = (payload = { roomId: 'room-1' }) =>
    new Promise((resolve) => socket.emit(event, payload, resolve));
  return { io, broadcast, client, grid, map, notify };
}

describe.each(['gridUpdated', 'mapUpdated'])('%s', (event) => {
  it.each([
    [{ joined: false }, { roomId: 'room-1' }],
    [{ role: 'player' }, { roomId: 'room-1' }],
    [{ role: null }, { roomId: 'room-1' }],
    [{}, { roomId: '' }],
    [{ roomError: new Error('database failure') }, { roomId: 'room-1' }],
  ])(
    'rejects invalid or unauthorized notifications without broadcasting (%j)',
    async (options, payload) => {
      const { notify, broadcast } = setup({ ...options, event });
      expect(await notify(payload)).toMatchObject({ ok: false });
      expect(broadcast).not.toHaveBeenCalled();
    },
  );

  it('broadcasts saved settings to the whole room, ignoring supplied values', async () => {
    const { notify, broadcast, io, grid, map } = setup({ event });
    expect(await notify({ roomId: 'room-1', grid_visible: true })).toEqual({ ok: true });
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(broadcast).toHaveBeenCalledWith(
      event,
      event === 'gridUpdated' ? grid : { roomId: 'room-1', map },
    );
  });
});
