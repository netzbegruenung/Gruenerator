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
      'axios', 'uuid', 'dompurify', 'file-saver',
      'prop-types', 'turndown'
    ],
    exclude: [
      'react-icons', '@react-pdf/renderer', 'docx', 'pdf-lib',
      'quill', 'y-quill', 'yjs', 'y-websocket',
      'motion', 'lodash', 'browser-image-compression'
    ],
    esbuildOptions: { 
      target: 'es2022',
      treeShaking: true
    }
  },
  build: {
    target: ['es2022', 'chrome88', 'firefox86', 'safari14'],
    sourcemap: false,
    cssCodeSplit: false, // Disable CSS code splitting to reduce memory usage
    assetsInlineLimit: 8192, // Increase inline limit to reduce file operations
    chunkSizeWarningLimit: 300, // Smaller chunks to reduce memory pressure
    outDir: 'build',
    // Memory-optimized build settings for server compatibility
    reportCompressedSize: false, // Skip gzip reporting to save memory
    minify: 'esbuild', // Use esbuild (10x more memory efficient than Terser)
    cssMinify: false, // Disable CSS minification (minor performance impact)
    emptyOutDir: true,
    rollupOptions: {
      // Memory-efficient treeshaking
      treeshake: {
        preset: 'smallest', // Lighter analysis to reduce memory overhead
        moduleSideEffects: false,
        propertyReadSideEffects: false, // Skip property read side-effect analysis
        tryCatchDeoptimization: false   // Skip try-catch deoptimization analysis
      },
      // Sequential processing to prevent memory spikes on server
      maxParallelFileOps: 1,
      // Additional memory optimizations
      perf: false, // Disable performance timings to save memory
      shimMissingExports: false, // Reduce analysis overhead
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
          'core-vendor': ['react', 'react-dom', 'react-router-dom'],
          'state-vendor': ['@tanstack/react-query', 'zustand'],
          'icons-vendor': ['react-icons'],
          'ui-vendor': ['react-select', 'react-tooltip', 'react-hook-form', 'react-dropzone'],
          'editor-vendor': ['quill', 'y-quill', 'yjs', 'y-websocket'],
          'utils-vendor': ['lodash', 'uuid', 'marked', 'turndown', 'dompurify'],
          'motion-vendor': ['motion']
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
