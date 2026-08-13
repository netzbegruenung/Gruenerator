import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Resolve workspace packages (@gruenerator/shared) to their TS sources. Shared by
// both projects — inline `test.projects` do not inherit the root-level `resolve`.
// Force react/react-dom onto the single hoisted copy: several deps (@tanstack/
// react-query, @radix-ui/react-slot) ship or resolve a nested older react, and two
// react instances crash hooks with "Invalid hook call" / "Cannot read … 'useContext'".
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
        // React component/render lane for the chat UI (message-part cards, tool-ui).
        // Kept separate so the node lane stays fast and globs never overlap.
        resolve,
        test: {
          name: 'dom',
          include: ['**/*.vitest.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          // Inline deps that render React so their internal `import 'react'` goes
          // through the alias instead of Node-resolving a nested copy (vitest
          // externalizes node_modules by default, bypassing the react dedupe).
          // Two react instances don't share the hook dispatcher, so the symptom
          // is "Cannot read properties of null (reading 'useContext')" at render.
          //
          // `/radix-ui/`, NOT `/@radix-ui/`: the shadcn components in
          // @gruenerator/ui import from the `radix-ui` UMBRELLA package, whose
          // name has no `@` and so never matched the scoped pattern — it stayed
          // externalized and Node-resolved @radix-ui/react-slot's nested react.
          // apps/web's config carries the same note.
          // `@tanstack/react-query` ships its OWN nested react (older than the
          // hoisted one), so a component that reaches a data hook — the plus
          // menu does, via the recipe library modal — crashes with "Cannot read
          // properties of null (reading 'useContext')" unless it is inlined too
          // and goes through the alias. apps/web's config carries the same list.
          server: {
            deps: { inline: ['@tanstack/react-query', /radix-ui/, '@gruenerator/ui'] },
          },
        },
      },
    ],
  },
});
