import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Force react/react-dom onto the single hoisted copy: two react instances crash
// hooks with "Invalid hook call". Both projects inherit it: since vitest 5
// inline `test.projects` extend the root config. Mirrors
// packages/chat/vitest.config.ts.
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
    projects: [
      {
        // Pure-logic lane: the Yjs op layer and the fit ladder. No DOM, fast.
        test: {
          name: 'node',
          include: ['**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Hook/component lane. Kept separate so the node lane stays fast and the
        // two globs never overlap (.test.ts vs .test.tsx).
        test: {
          name: 'dom',
          include: ['**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
