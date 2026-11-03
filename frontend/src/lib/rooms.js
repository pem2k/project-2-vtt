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

export function validateJoinDetails({ roomCode, password }) {
  if (!roomCode?.trim()) return 'Room code is required.';
  if (!password?.trim()) return 'Password is required.';
  return null;
}

export async function joinRoom(client, { roomCode, password }) {
  const { data, error } = await client.rpc('join_room', {
    p_room_code: roomCode.trim().toUpperCase(),
    p_password: password,
  });

  if (error) throw error;

  return data;
}
