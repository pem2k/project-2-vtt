import { defineConfig, devices } from '@playwright/test';

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  throw new Error('Run with a local Supabase stack: npm run test:e2e:local');
}
const hostname = new URL(supabaseUrl).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
  throw new Error('E2E tests create disposable users and rooms; SUPABASE_URL must be local.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node src/server.js',
      cwd: '../backend',
      url: 'http://127.0.0.1:3100/health',
      reuseExistingServer: false,
      env: {
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: anonKey,
        CLIENT_ORIGIN: 'http://127.0.0.1:4173',
        PORT: '3100',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: supabaseUrl,
        VITE_SUPABASE_ANON_KEY: anonKey,
        VITE_SOCKET_URL: 'http://127.0.0.1:3100',
      },
    },
  ],
});
