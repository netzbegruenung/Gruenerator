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
