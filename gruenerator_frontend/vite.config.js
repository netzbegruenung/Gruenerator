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
    chunkSizeWarningLimit: 300, // Smaller chunks to reduce memory pressure
    outDir: 'build',
    // Selective optimizations - balance memory usage with performance
    reportCompressedSize: false, // Skip gzip reporting to save memory
    minify: 'terser', // Keep JS minification (critical for performance)
    cssMinify: false, // Disable CSS minification (minor performance impact)
    emptyOutDir: true,
    rollupOptions: {
      // Memory-efficient treeshaking
      treeshake: {
        preset: 'smallest', // Lighter analysis to reduce memory overhead
        moduleSideEffects: false
      },
      // Controlled parallel processing (compromise between speed and memory)
      maxParallelFileOps: 2,
      // Manual vendor chunking for memory efficiency
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
        },
        // Intelligent vendor chunking to reduce build memory pressure
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router-vendor': ['react-router-dom'],
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-query-devtools'],
          'editor-vendor': ['quill', 'quilljs-markdown', 'y-quill', 'yjs', 'y-websocket'],
          'ui-vendor': ['react-icons', 'react-select', 'react-tooltip'],
          'form-vendor': ['react-hook-form', 'react-dropzone'],
          'utils-vendor': ['lodash', 'lodash.debounce', 'uuid', 'marked', 'turndown']
          // Heavy libraries removed from manual chunks - they're already lazy-loaded as dynamic imports
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
