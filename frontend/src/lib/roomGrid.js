export async function getRoomGrid(client, roomId) {
  const { data, error } = await client
    .from('rooms')
    .select('id, grid_visible, grid_cell_size')
    .eq('id', roomId)
    .single();
  if (error) throw error;
  return data;
}

export async function setRoomGrid(client, { roomId, visible, cellSize }) {
  const { data, error } = await client.rpc('set_room_grid', {
    p_room_id: roomId,
    p_grid_visible: visible,
    p_grid_cell_size: cellSize,
  });
  if (error) throw error;
  return data[0];
}

export function emitGridUpdated(socket, roomId) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('gridUpdated', { roomId }, (error, response) => {
      if (error || !response?.ok) {
        reject(new Error('Grid saved, but could not sync to other players.'));
      } else {
        resolve();
      }
    });
  });
}
