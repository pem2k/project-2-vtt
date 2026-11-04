export function validateRoomDetails({ roomName, password }) {
  if (!roomName?.trim()) return 'Room name is required.';
  if (!password?.trim()) return 'Password is required.';
  return null;
}

export async function createRoom(client, { roomName, password }) {
  const { data, error } = await client.rpc('create_room', {
    p_name: roomName.trim(),
    p_password: password,
  });

  if (error) throw error;

  return Array.isArray(data) ? data[0] : data;
}

export function validateJoinDetails({ roomName, password }) {
  if (!roomName?.trim()) return 'Room name is required.';
  if (!password?.trim()) return 'Password is required.';
  return null;
}

export async function joinRoom(client, { roomName, password }) {
  const { data, error } = await client.rpc('join_room', {
    p_name: roomName.trim(),
    p_password: password,
  });

  if (error) throw error;

  return data;
}

export async function getRoomName(client, roomId) {
  const { data, error } = await client.from('rooms').select('name').eq('id', roomId);

  if (error) throw error;
  if (!data?.[0]?.name) throw new Error('Room name could not be loaded.');

  return data[0].name;
}

export async function getRoomMembers(client, roomId) {
  const { data, error } = await client.rpc('get_room_members', {
    p_room_id: roomId,
  });

  if (error) throw error;

  return data ?? [];
}
