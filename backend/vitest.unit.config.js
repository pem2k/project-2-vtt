import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'test-anon-key',
    },
    environment: 'node',
    include: [
      'tests/dice.test.js',
      'tests/diceSocket.test.js',
      'tests/socket.test.js',
      'tests/socketCors.test.js',
      'tests/roomSocket.test.js',
      'tests/tokenSocket.test.js',
      'tests/characterSocket.test.js',
    ],
  },
});
