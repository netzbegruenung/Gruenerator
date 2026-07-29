import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
    ...(process.env.CI ? {} : { maxWorkers: 2, minWorkers: 1 }),
  },
});
