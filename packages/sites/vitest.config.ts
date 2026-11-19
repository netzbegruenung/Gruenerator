import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    include: ['src/**/*.vitest.ts'],
    environment: 'node',
    ...(process.env['CI'] ? {} : { maxWorkers: 2 }),
  },
});
