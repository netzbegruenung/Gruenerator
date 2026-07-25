import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Resolve workspace packages (@gruenerator/*) to their TS sources. Shared by both
// projects — inline `test.projects` do not inherit the root-level `resolve`.
// Force react/react-dom onto the single hoisted copy. @tanstack/react-query ships
// a nested older react (19.2.3 vs the root 19.2.8); without this, a hook rendered
// under QueryClientProvider crashes with "Cannot read properties of null (reading
// 'useEffect')" because two react instances don't share the dispatcher. String
// aliases match `react` and `react/jsx-runtime` but not `react-dom` (word boundary).
const reactRoot = path.resolve(import.meta.dirname, '../../node_modules');
const resolve = {
  conditions: ['development'],
  dedupe: ['react', 'react-dom'],
  alias: {
    '@': path.resolve(import.meta.dirname, './src'),
    react: path.resolve(reactRoot, 'react'),
    'react-dom': path.resolve(reactRoot, 'react-dom'),
  },
};

export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        // Fast pure-logic lane — no DOM, unchanged from the original config.
        resolve,
        test: {
          name: 'node',
          include: ['**/*.vitest.ts'],
          environment: 'node',
        },
      },
      {
        // React component/render lane. Kept separate so the node lane stays fast
        // and the two globs never overlap (.ts vs .tsx).
        resolve,
        test: {
          name: 'dom',
          include: ['**/*.vitest.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          // Inline react-query so its internal `import 'react'` goes through the
          // alias above instead of Node-resolving its nested 19.2.3 copy (vitest
          // externalizes node_modules by default, bypassing the react dedupe).
          server: { deps: { inline: ['@tanstack/react-query'] } },
        },
      },
    ],
  },
});
