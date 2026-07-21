import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Subpath resolved via vite alias in the apps (no exports-map entry) —
      // mirror it here so configs importing runtime values from it load.
      '@gruenerator/shared/canvas-editor': path.resolve(
        __dirname,
        '../shared/src/canvas-editor/index.ts'
      ),
    },
  },
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
  },
});
