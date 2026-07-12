import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve workspace packages (@gruenerator/*) to their TS sources.
    conditions: ['development'],
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
  },
});
