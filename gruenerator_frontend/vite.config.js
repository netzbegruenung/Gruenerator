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
      'axios', 'uuid', 'dompurify', 'file-saver',
      'prop-types', '@mdxeditor/editor'
    ],
    exclude: [
      'motion', 'lodash', 'browser-image-compression'
    ],
    esbuildOptions: { 
      target: 'es2022',
      treeShaking: true
    }
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true, // keep as-is; not changing chunking behavior here
    assetsInlineLimit: 0, // avoid inlining to reduce bundler memory use
    chunkSizeWarningLimit: 300, // Smaller chunks to reduce memory pressure
    outDir: 'build',
    // Memory-optimized build settings for server compatibility
    reportCompressedSize: false, // Skip gzip reporting to save memory
    modulePreload: { polyfill: true }, // enable modulepreload for motion and other chunks
    minify: 'esbuild', // enable minification for production
    cssMinify: true, // Enable CSS minification
    emptyOutDir: true,
    rollupOptions: {
      // Enable tree shaking for smaller bundles
      treeshake: true,
      cache: false,
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
          const name = assetInfo.names?.[0] || '';
          if (name.endsWith('.jsx')) {
            return `assets/js/${name.replace('.jsx', '')}.[hash].js`;
          }
          const ext = name.split('.').pop();
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
          'ui-vendor': ['react-tooltip', 'react-hook-form', 'react-dropzone'],
          'utils-vendor': ['lodash', 'uuid', 'dompurify'],
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
