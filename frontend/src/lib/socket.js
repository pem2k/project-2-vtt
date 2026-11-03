import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export function connectSocket(accessToken) {
  return io(socketUrl, {
    auth: { accessToken },
  });
}

export function joinRoomChannel(socket, roomId) {
  return new Promise((resolve, reject) => {
    socket.emit('joinRoom', roomId, (response) => {
      if (!response?.ok) {
        reject(new Error(response?.error || 'Unable to join room channel.'));
        return;
      }
      resolve(response);
    });
  });
}
