import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Force react/react-dom onto the single hoisted copy: two react instances crash
// hooks with "Invalid hook call". Shared by both projects — inline
// `test.projects` do not inherit the root-level `resolve`. Mirrors
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
        resolve,
        test: {
          name: 'node',
          include: ['**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Hook/component lane. Kept separate so the node lane stays fast and the
        // two globs never overlap (.test.ts vs .test.tsx).
        resolve,
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
