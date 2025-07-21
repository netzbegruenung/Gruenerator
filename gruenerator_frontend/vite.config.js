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
    target: ['es2022', 'chrome88', 'firefox86', 'safari14'],
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 4096, // Inline small assets to reduce HTTP requests
    chunkSizeWarningLimit: 800, // Lower threshold to catch bundle growth
    outDir: 'build',
    // Aggressive build optimizations for server memory constraints
    reportCompressedSize: false, // Skip gzip reporting
    minify: false, // Disable minification to reduce memory usage
    cssMinify: false, // Disable CSS minification  
    emptyOutDir: true,
    rollupOptions: {
      // Simplified treeshaking for reduced memory usage
      treeshake: false, // Disable to reduce analysis memory overhead
      // Sequential processing to prevent concurrent memory spikes
      maxParallelFileOps: 1,
      // Single chunk build - no complex chunking to reduce memory pressure
      output: {
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
  },
  server: {
    port: 3000,
    open: command === 'serve',
    watch: { 
      usePolling: true,
      ignored: [
        '**/node_modules/**',
        '**/dist/**', 
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/.nyc_output/**',
        '**/tmp/**',
        '**/temp/**'
      ]
    },
    hmr: { overlay: false }
  }
}));
