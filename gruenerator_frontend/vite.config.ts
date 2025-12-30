import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect Tauri build environment - set by Tauri CLI during builds
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

export default defineConfig(({ command }) => ({
  plugins: [
    react({ jsxRuntime: 'automatic' })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, './'),
      '@gruenerator/shared': path.resolve(__dirname, '../packages/shared/src')
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
    // Use compatible targets for Tauri WebViews (Chrome=Edge WebView2, Safari=WKWebView)
    target: isTauri ? ['chrome105', 'safari15'] : 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 300,
    outDir: 'build',
    reportCompressedSize: false,
    modulePreload: { polyfill: true },
    minify: 'esbuild',
    cssMinify: true,
    emptyOutDir: true,
    rollupOptions: {
      treeshake: true,
      cache: false,
      maxParallelFileOps: 1,
      perf: false,
      shimMissingExports: false,
      // Only externalize Tauri plugins for WEB builds - desktop builds must bundle them
      // isTauri is true when TAURI_ENV_PLATFORM is set (during Tauri CLI builds)
      external: (command === 'build' && !isTauri) ? [
        '@tauri-apps/plugin-fs',
        '@tauri-apps/plugin-opener',
        '@tauri-apps/api/path',
        '@tauri-apps/api/window'
      ] : [],
      output: {
        entryFileNames: 'assets/js/[name].[hash].js',
        chunkFileNames: 'assets/js/[name].[hash].js',
        assetFileNames(assetInfo) {
          const name = assetInfo.names?.[0] || '';
          if (name.endsWith('.jsx') || name.endsWith('.tsx')) {
            return `assets/js/${name.replace(/\.(jsx|tsx)$/, '')}.[hash].js`;
          }
          const ext = name.split('.').pop() || '';
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
    strictPort: true, // Tauri expects exact port - fail if unavailable
    open: command === 'serve' && !isTauri, // Don't auto-open browser for Tauri dev
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
