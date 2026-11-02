import { defineConfig } from 'vitest/config';

// DB integration tests run against the local Supabase stack (no mocks), so give
// them room for network round-trips and load the stack's URL/keys before tests.
export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
