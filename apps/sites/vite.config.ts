import path from 'node:path';
import { fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    tailwindcss(),
    react({ jsxRuntime: 'automatic' }),
    ...(command === 'build' ? [babel({ presets: [reactCompilerPreset()] })] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@gruenerator/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@gruenerator/sites-design': path.resolve(__dirname, '../../packages/sites-design/src'),
      // @gruenerator/contracts is imported transitively from shared
      // (packages/shared/src/api/contractsClient.ts pulls every contract
      // from @gruenerator/contracts). Vite's alias system doesn't cascade
      // through workspace deps — any workspace package aliased to src/
      // must have ALL its workspace-package imports explicitly aliased
      // too, otherwise Rolldown's resolver falls through to the dist/
      // entry in package.json exports which isn't built at web-build time.
      // Symptom: "Rolldown failed to resolve import '@gruenerator/contracts'
      // from packages/shared/src/api/contractsClient.ts".
      '@gruenerator/contracts': path.resolve(__dirname, '../../packages/contracts/src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    outDir: 'dist',
    emptyOutDir: true,
    cssMinify: true,
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  server: {
    port: 3004,
    open: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}));
