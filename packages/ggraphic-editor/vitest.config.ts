// SPDX-License-Identifier: MPL-2.0
import { createRequire } from 'node:module';
import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const resolvePackage = (name: string) =>
  path.dirname(createRequire(import.meta.url).resolve(`${name}/package.json`));

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic: stores, geometry, commands, Yjs documents. No DOM.
        test: {
          name: 'node',
          include: ['src/**/*.vitest.ts'],
          environment: 'node',
          // Separate groups because the lanes have different `maxWorkers`;
          // vitest 4 rejects the whole run otherwise. The fast lane first.
          sequence: { groupOrder: 0 },
        },
      },
      {
        // React render lane: jsdom on `*.vitest.tsx`, with the React Compiler
        // preset `vite build` runs.
        plugins: [babel({ presets: [reactCompilerPreset()] })],
        // @tanstack/react-query ships a nested older react; without one copy a
        // hook under QueryClientProvider dies at "reading 'useEffect'".
        resolve: {
          dedupe: ['react', 'react-dom'],
          alias: {
            react: resolvePackage('react'),
            'react-dom': resolvePackage('react-dom'),
          },
        },
        test: {
          name: 'dom',
          server: { deps: { inline: ['@tanstack/react-query'] } },
          include: ['src/**/*.vitest.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
