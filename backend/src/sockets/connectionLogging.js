export function registerConnectionLogging(io, logger = console.log) {
  io.on('connection', (socket) => {
    logger(`Socket connected: ${socket.id}`);

    socket.on('disconnect', () => {
      logger(`Socket disconnected: ${socket.id}`);
    });
  });
}
