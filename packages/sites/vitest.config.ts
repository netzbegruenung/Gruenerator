import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Same alias/dedupe and inline list as packages/chat/vitest.config.ts (see the notes there and
// in apps/web/CLAUDE-testing.md): two React instances break the hook dispatcher.
const reactRoot = path.resolve(import.meta.dirname, '../../node_modules');
const resolve = {
  conditions: ['development'],
  dedupe: ['react', 'react-dom'],
  alias: {
    react: path.resolve(reactRoot, 'react'),
    'react-dom': path.resolve(reactRoot, 'react-dom'),
  },
};

export default defineConfig({
  resolve,
  test: {
    ...(process.env['CI'] ? {} : { maxWorkers: 2 }),
    projects: [
      {
        test: {
          name: 'node',
          include: ['src/**/*.vitest.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [babel({ presets: [reactCompilerPreset()] })],
        test: {
          name: 'dom',
          include: ['src/**/*.vitest.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          server: {
            deps: { inline: ['@tanstack/react-query', /radix-ui/, '@gruenerator/ui'] },
          },
        },
      },
    ],
  },
});
