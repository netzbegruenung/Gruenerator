import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [
    tailwindcss(),
    react({ jsxRuntime: 'automatic' }),
    ...(command === 'build' ? [babel({ presets: [reactCompilerPreset()] })] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@gruenerator/chat': path.resolve(__dirname, '../../packages/chat/src'),
      // Aliases don't cascade through workspace deps — chatStore.ts in
      // @gruenerator/chat imports @gruenerator/shared/models, and shared
      // uses conditional exports (development → src, import → dist) where
      // dist is only present in published builds. Aliasing the source
      // directly bypasses the dist requirement, matching apps/web's setup.
      '@gruenerator/shared': path.resolve(__dirname, '../../packages/shared/src'),
      // shared/models re-exports from @gruenerator/core; aliases don't cascade,
      // so core must be aliased to src too (same reason as shared above).
      '@gruenerator/core': path.resolve(__dirname, '../../packages/core/src'),
      // shared/utils/textNormalization + shared/search re-export from
      // @gruenerator/query/*; alias to src so Rolldown resolves it (same cascade).
      '@gruenerator/query': path.resolve(__dirname, '../../packages/query/src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    outDir: 'dist',
  },
  server: {
    port: 3005,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}));
