import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

let activeSocket = null;

export function connectSocket(accessToken) {
  if (activeSocket) {
    activeSocket.disconnect();
  }
  activeSocket = io(socketUrl, {
    auth: { accessToken },
  });
  return activeSocket;
}

export function getSocket() {
  return activeSocket;
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
