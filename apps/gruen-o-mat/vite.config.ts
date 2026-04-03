import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [
    tailwindcss(),
    react({
      jsxRuntime: 'automatic',
      babel: { plugins: [['babel-plugin-react-compiler']] },
    }),
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
});
