import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { importReport } from './importReport.ts';

const repo = path.resolve(import.meta.dirname, '../..');
const src = (pkg: string) => path.join(repo, 'packages', pkg, 'src');

export default defineConfig({
  plugins: [react(), importReport({ root: repo })],
  resolve: {
    // These packages point `import` at a dist that only the Node services
    // build; the editor reads them from source, as apps/web does.
    alias: {
      '@gruenerator/shared': src('shared'),
      '@gruenerator/contracts': src('contracts'),
      '@gruenerator/core': src('core'),
      '@gruenerator/query': src('query'),
      '@ggraphic/schema': src('ggraphic-schema'),
    },
    // One React: @tanstack/react-query carries a nested copy (see apps/web).
    dedupe: ['react', 'react-dom'],
  },
  build: {
    reportCompressedSize: false,
    chunkSizeWarningLimit: 5000,
  },
});
