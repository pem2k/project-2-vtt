import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';

describe('Socket.IO server', () => {
  it('starts an HTTP server with Socket.IO attached', async () => {
    const { httpServer, io } = createServer();

    expect(httpServer).toHaveProperty('listen', expect.any(Function));
    expect(httpServer).toHaveProperty('close', expect.any(Function));
    expect(io).toHaveProperty('on', expect.any(Function));
    expect(io).toHaveProperty('use', expect.any(Function));

    await new Promise((resolve) => httpServer.close(resolve));
  });

  it('logs socket connections and disconnections', () => {
    const socket = new EventEmitter();
    socket.id = 'socket-1';
    const io = new EventEmitter();
    io.use = vi.fn();
    const logger = vi.fn();

    createServer({ io, logger });
    io.emit('connection', socket);
    socket.emit('disconnect');

    expect(io.use).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenNthCalledWith(1, 'Socket connected: socket-1');
    expect(logger).toHaveBeenNthCalledWith(2, 'Socket disconnected: socket-1');
  });
});
