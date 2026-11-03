import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';

const nodeGlobals = {
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setImmediate: 'readonly',
};

const testGlobals = {
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  vi: 'readonly',
};

export default defineConfig([
  globalIgnores(['coverage', 'node_modules']),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...nodeGlobals, ...testGlobals },
      sourceType: 'module',
    },
  },
  prettierConfig,
]);
