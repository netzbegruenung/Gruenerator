import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { importReport } from './importReport.ts';

const repo = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  plugins: [react(), importReport({ root: repo })],
  resolve: {
    // One React: @tanstack/react-query carries a nested copy (see apps/web).
    dedupe: ['react', 'react-dom'],
  },
  build: {
    reportCompressedSize: false,
    chunkSizeWarningLimit: 5000,
  },
});
