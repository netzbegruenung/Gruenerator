import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve workspace packages (@gruenerator/shared) to their TS sources.
    conditions: ['development'],
  },
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
  },
});
