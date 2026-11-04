import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { registerConnectionLogging } from './sockets/connectionLogging.js';
import { registerJoinRoom, registerSocketAuth } from './sockets/roomSocket.js';

// CORS is enforced by the browser, so the Socket.IO server must explicitly
// allow the frontend's origin or the handshake is blocked cross-origin. The
// allowed origin(s) come from CLIENT_ORIGIN (comma-separated for multiple
// environments); the localhost fallback keeps local dev working without config.
export function buildCorsOptions(clientOrigin = process.env.CLIENT_ORIGIN) {
  if (!clientOrigin) {
    return { origin: ['http://localhost:5173'], methods: ['GET', 'POST'] };
  }

  const origin = clientOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return { origin, methods: ['GET', 'POST'] };
}

export function createServer({ io: providedIo, logger = console.log } = {}) {
  const app = express();
  const httpServer = createHttpServer(app);

  let io = providedIo;
  if (!io) {
    io = new Server(httpServer, { cors: buildCorsOptions() });
  }

  registerConnectionLogging(io, logger);
  registerSocketAuth(io);
  registerJoinRoom(io, { logger });

  return { app, httpServer, io };
}

export function startServer(port = process.env.PORT ?? 3000) {
  const server = createServer();
  server.httpServer.listen(port, () => {
    console.log(`HTTP server listening on port ${port}`);
  });
  return server;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer();
}
