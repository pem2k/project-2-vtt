import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

let activeSocket = null;

export function connectSocket(accessToken, options = {}) {
  if (activeSocket) {
    activeSocket.disconnect();
  }
  activeSocket = io(socketUrl, {
    auth: { accessToken },
    ...options,
  });
  return activeSocket;
}

export function getSocket() {
  return activeSocket;
}

export function disconnectSocket() {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
  }
}

export function joinRoomChannel(socket, roomId, { timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket is not connected.'));
      return;
    }

    let settled = false;
    let timer = null;

    if (timeout > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out waiting to join room channel.'));
      }, timeout);
    }

    socket.emit('joinRoom', roomId, (response) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);

      if (!response?.ok) {
        reject(new Error(response?.error || 'Unable to join room channel.'));
        return;
      }
      resolve(response);
    });
  });
}
