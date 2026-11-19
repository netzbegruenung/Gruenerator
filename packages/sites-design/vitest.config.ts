import path from 'node:path';

import { defineConfig } from 'vitest/config';

const reactRoot = path.resolve(import.meta.dirname, '../../node_modules');

export default defineConfig({
  resolve: {
    conditions: ['development'],
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(reactRoot, 'react'),
      'react-dom': path.resolve(reactRoot, 'react-dom'),
    },
  },
  test: {
    include: ['src/**/*.vitest.{ts,tsx}'],
    environment: 'node',
    ...(process.env['CI'] ? {} : { maxWorkers: 2 }),
  },
});
