import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/dice.test.js', 'tests/socket.test.js', 'tests/roomSocket.test.js'],
  },
});
