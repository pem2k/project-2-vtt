import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { registerConnectionLogging } from './sockets/connectionLogging.js';
import { registerJoinRoom, registerSocketAuth } from './sockets/roomSocket.js';
import { log } from './utils/logger.js';

export function createServer({ io: providedIo, logger = log } = {}) {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = providedIo ?? new Server(httpServer);

  registerConnectionLogging(io, logger);
  if (typeof io.use === 'function') registerSocketAuth(io);
  registerJoinRoom(io);

  return { app, httpServer, io };
}

export function startServer(port = process.env.PORT ?? 3000) {
  const server = createServer();
  server.httpServer.listen(port, () => {
    log(`HTTP server listening on port ${port}`);
  });
  return server;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer();
}
