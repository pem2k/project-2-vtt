import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { registerConnectionLogging } from './sockets/connectionLogging.js';
import { registerJoinRoom, registerSocketAuth } from './sockets/roomSocket.js';
import { registerDiceEvents } from './sockets/diceSocket.js';
import { registerTokenEvents } from './sockets/tokenSocket.js';
import { registerCharacterEvents } from './sockets/characterSocket.js';
import { loadBackendEnv } from './utils/supabaseConfig.js';

// CORS is enforced by the browser, so the Socket.IO server must explicitly
// allow the frontend's origin or the handshake is blocked cross-origin. The
// allowed origin(s) come from CLIENT_ORIGIN (comma-separated for multiple
// environments); the localhost fallback keeps local dev working without config.
// A * in an entry matches one subdomain segment (no dots or slashes) so a
// preview host like https://project-2-vtt-*.vercel.app can be allowed. Exact
// entries stay strings; wildcard entries become anchored regular expressions.
const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toOriginMatcher(entry) {
  if (!entry.includes('*')) {
    return entry;
  }

  const pattern = entry.split('*').map(escapeRegExp).join('[^./]+');
  return new RegExp(`^${pattern}$`);
}

export function buildCorsOptions(clientOrigin = process.env.CLIENT_ORIGIN) {
  if (!clientOrigin) {
    return { origin: [LOCAL_DEV_ORIGIN], methods: ['GET', 'POST'] };
  }

  const origin = clientOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(toOriginMatcher);

  return { origin, methods: ['GET', 'POST'] };
}

export function createServer({ io: providedIo, logger = console.log } = {}) {
  const app = express();
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  const httpServer = createHttpServer(app);

  let io = providedIo;
  if (!io) {
    io = new Server(httpServer, { cors: buildCorsOptions() });
  }

  registerConnectionLogging(io, logger);
  registerSocketAuth(io);
  registerJoinRoom(io, { logger });
  registerTokenEvents(io);
  registerDiceEvents(io);
  registerCharacterEvents(io);

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
  loadBackendEnv();
  startServer();
}
