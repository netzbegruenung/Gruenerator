import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react({ jsxRuntime: 'automatic' })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@gruenerator/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    cssMinify: true,
  },
  server: {
    port: 3003,
  },
});
