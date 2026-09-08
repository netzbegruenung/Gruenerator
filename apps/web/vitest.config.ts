import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
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
    ...(process.env.CI ? {} : { maxWorkers: 2, minWorkers: 1 }),
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
        //
        // The dom lane runs the React Compiler — the SAME babel preset the
        // production build applies (vite.config.ts). The compiler only ever ran
        // on `vite build`, so its output was first executed in production; that
        // shipped a hook-order crash (React #311, SwapLabel in packages/chat).
        // With the preset here, component tests execute the compiled code the
        // bundle ships. packages/chat's config carries the same line.
        plugins: [babel({ presets: [reactCompilerPreset()] })],
        resolve,
        test: {
          name: 'dom',
          include: ['**/*.vitest.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          // Inline deps that render React so their internal `import 'react'`
          // goes through the alias above instead of Node-resolving a nested copy
          // (vitest externalizes node_modules by default, bypassing the react
          // dedupe). Two react instances don't share the hook dispatcher, so the
          // symptom is "Cannot read properties of null (reading 'useContext' /
          // 'useEffect')" at render. Offenders today: @tanstack/react-query
          // (nested 19.2.3 vs the root 19.2.8) and @radix-ui/react-slot +
          // react-tabs, which every `asChild` trigger goes through.
          //
          // The pattern is `/radix-ui/`, NOT `/@radix-ui/`: shadcn components
          // in @gruenerator/ui import from the `radix-ui` UMBRELLA package, whose
          // name has no `@` and so never matches the scoped pattern. Left
          // externalized, it Node-resolves its own @radix-ui/* deps and the
          // inlining never reaches them. packages/chat carries the same pattern.
          // Re-check the offender list with:
          //   ls -d node_modules/**/node_modules/react
          server: {
            deps: {
              inline: ['@tanstack/react-query', /radix-ui/, '@gruenerator/ui'],
            },
          },
        },
      },
    ],
  },
});
