import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  plugins: [
    react({ jsxRuntime: 'automatic' })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, './')
    }
  },
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom',
      '@tanstack/react-query', 'zustand',
      '@supabase/supabase-js',
      'motion/react'
    ],
    esbuildOptions: { 
      target: 'es2022',
      treeShaking: true
    }
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: 'esbuild',
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
    outDir: 'build',
    rollupOptions: {
      maxParallelFileOps: 16,
      treeshake: { 
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
            if (id.includes('@tanstack')) return 'query-vendor';
            if (id.includes('@supabase')) return 'supabase-vendor';
            if (id.includes('motion')) return 'motion-vendor';
            if (id.includes('react-icons')) return 'icons-vendor';
            if (id.includes('quill')) return 'quill-vendor';
            if (id.includes('marked')) return 'markdown-vendor';
            if (id.includes('turndown')) return 'turndown-vendor';
            if (id.includes('lodash') || id.includes('uuid') || id.includes('dompurify')) return 'utils-vendor';
            return 'misc-vendor';
          }
          if (id.includes('src/features/auth')) return 'auth-feature';
          if (id.includes('src/features/texte')) return 'texte-feature';
          if (id.includes('src/features/groups')) return 'groups-feature';
          if (id.includes('src/features/sharepic')) return 'sharepic-feature';
          if (id.includes('src/features/templates')) return 'templates-feature';
          if (id.includes('src/features/generators')) return 'generators-feature';
          if (id.includes('src/components/common')) return 'common-ui';
          if (id.includes('src/components/layout')) return 'layout';
          if (id.includes('src/hooks') || id.includes('src/stores')) return 'core-logic';
        },
        entryFileNames: 'assets/js/[name].[hash].js',
        chunkFileNames: 'assets/js/[name].[hash].js',
        assetFileNames(assetInfo) {
          // Force .js extension for any remaining jsx files
          if (assetInfo.name.endsWith('.jsx')) {
            return `assets/js/${assetInfo.name.replace('.jsx', '')}.[hash].js`;
          }
          const ext = assetInfo.name.split('.').pop();
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp/i.test(ext)) {
            return 'assets/images/[name].[hash][extname]';
          }
          if (/css/i.test(ext)) {
            return 'assets/css/[name].[hash][extname]';
          }
          if (/woff2?|ttf|eot/i.test(ext)) {
            return 'assets/fonts/[name].[hash][extname]';
          }
          return 'assets/[name].[hash][extname]';
        }
      }
    },
    cssMinify: 'esbuild'
  },
  server: {
    port: 3000,
    open: command === 'serve',
    watch: { usePolling: true },
    hmr: { overlay: false }
  }
}));
