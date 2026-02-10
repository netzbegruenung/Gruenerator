import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  plugins: [
    react({ jsxRuntime: 'automatic' }),
    compression({ algorithms: ['gzip', 'brotliCompress'] }),
  ],
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
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mantine': ['@mantine/core', '@mantine/hooks'],
          'vendor-editor': [
            '@blocknote/core',
            '@blocknote/react',
            '@blocknote/mantine',
            'yjs',
            'y-websocket',
            '@hocuspocus/provider',
          ],
          'vendor-blocknote-ai': ['@blocknote/xl-ai'],
          'vendor-state': ['@tanstack/react-query', 'zustand', 'axios'],
        },
      },
    },
  },
  server: {
    port: 3002,
    open: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
