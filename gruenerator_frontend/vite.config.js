import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  plugins: [
    react({ jsxRuntime: 'automatic', babel: { plugins: ['babel-plugin-macros'] } })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, './')
    }
  },
  optimizeDeps: {
    exclude: ['react-icons', 'lottie-web'],
    esbuildOptions: { target: 'es2020' }
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    cssCodeSplit: true,
    assetsInlineLimit: 1024,
    chunkSizeWarningLimit: 1500,
    outDir: 'build',
    commonjsOptions: {
      exclude: [/node_modules\/lottie-web/]
    },
    rollupOptions: {
      external: [
        'react-icons',
        'lottie-web',
        '@mui/material',
        '@mui/icons-material',
        '@supabase/supabase-js'
      ],
      maxParallelFileOps: 16,
      treeshake: { moduleSideEffects: false },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'react';
            if (id.includes('@mui')) return 'mui';
            if (id.includes('@supabase')) return 'supabase';
          }
        },
        entryFileNames: 'assets/js/[name].[hash].js',
        chunkFileNames: 'assets/js/[name].[hash].js',
        assetFileNames(assetInfo) {
          const ext = assetInfo.name.split('.').pop();
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return 'assets/images/[name].[hash][extname]';
          }
          if (/css/i.test(ext)) {
            return 'assets/css/[name].[hash][extname]';
          }
          return 'assets/[name].[hash][extname]';
        }
      }
    }
  },
  server: {
    port: 3000,
    open: command === 'serve',
    watch: { usePolling: true },
    hmr: { overlay: false }
  }
}));
