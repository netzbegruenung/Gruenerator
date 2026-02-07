import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect Tauri build environment - set by Tauri CLI during builds
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

// Detect Capacitor build environment - set by our build scripts
const isCapacitor = process.env.CAPACITOR_ENV_PLATFORM !== undefined;

// Combined native app detection (either Tauri or Capacitor)
const isNativeBuild = isTauri || isCapacitor;

// Tauri packages that need stubs when running in web context
const tauriPackages = [
  '@tauri-apps/api',
  '@tauri-apps/api/app',
  '@tauri-apps/api/path',
  '@tauri-apps/api/window',
  '@tauri-apps/plugin-fs',
  '@tauri-apps/plugin-opener',
  '@tauri-apps/plugin-shell',
  '@tauri-apps/plugin-updater',
  '@tauri-apps/plugin-process',
  '@tauri-apps/plugin-store',
];

// Capacitor packages that need stubs when running in web context
const capacitorPackages = [
  '@capacitor/core',
  '@capacitor/app',
  '@capacitor/browser',
  '@capacitor/camera',
  '@capacitor/clipboard',
  '@capacitor/filesystem',
  '@capacitor/keyboard',
  '@capacitor/preferences',
  '@capacitor/share',
  '@capacitor/splash-screen',
  '@capacitor/status-bar',
];

// Plugin to provide stub modules for Tauri packages in web context
function tauriStubPlugin(): Plugin {
  return {
    name: 'tauri-stub',
    enforce: 'pre',
    resolveId(id) {
      if (tauriPackages.some((pkg) => id === pkg || id.startsWith(pkg + '/'))) {
        return `\0tauri-stub:${id}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith('\0tauri-stub:')) {
        // Return empty stub module - actual Tauri imports are guarded by isDesktopApp() checks
        return `export default {};
export const check = () => Promise.resolve(null);
export const getVersion = () => Promise.resolve("web");
export const relaunch = () => Promise.resolve();
export const invoke = () => Promise.resolve(null);
export const listen = () => Promise.resolve(() => {});
export class Resource { close() {} }
`;
      }
      return null;
    },
  };
}

// Plugin to provide stub modules for Capacitor packages in web context
function capacitorStubPlugin(): Plugin {
  return {
    name: 'capacitor-stub',
    enforce: 'pre',
    resolveId(id) {
      if (capacitorPackages.some((pkg) => id === pkg || id.startsWith(pkg + '/'))) {
        return `\0capacitor-stub:${id}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith('\0capacitor-stub:')) {
        // Return empty stub module - actual Capacitor imports are guarded by isCapacitorApp() checks
        return `export default {};
export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: () => false,
};
export const registerPlugin = () => ({});
export const App = { addListener: () => ({ remove: () => {} }) };
export const Browser = { open: () => Promise.resolve(), close: () => Promise.resolve() };
export const Camera = { getPhoto: () => Promise.resolve(null) };
export const Clipboard = { read: () => Promise.resolve(null), write: () => Promise.resolve() };
export const Filesystem = { readFile: () => Promise.resolve(null), writeFile: () => Promise.resolve() };
export const Keyboard = { addListener: () => ({ remove: () => {} }) };
export const Preferences = { get: () => Promise.resolve(null), set: () => Promise.resolve(), remove: () => Promise.resolve() };
export const Share = { share: () => Promise.resolve() };
export const SplashScreen = { hide: () => Promise.resolve(), show: () => Promise.resolve() };
export const StatusBar = { setStyle: () => Promise.resolve() };
`;
      }
      return null;
    },
  };
}

export default defineConfig(({ command }) => ({
  // Use relative paths for native builds so assets resolve correctly
  base: isNativeBuild ? './' : '/',
  plugins: [
    // Only use Tauri stub plugin when NOT in Tauri context
    ...(!isTauri ? [tauriStubPlugin()] : []),
    // Only use Capacitor stub plugin when NOT in Capacitor context
    ...(!isCapacitor ? [capacitorStubPlugin()] : []),
    react({ jsxRuntime: 'automatic' }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, './'),
      '@gruenerator/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'zustand',
      'axios',
      'uuid',
      'dompurify',
      'file-saver',
      'prop-types',
      '@mdxeditor/editor',
    ],
    exclude: [
      'motion',
      'lodash',
      'browser-image-compression',
      '@imgly/background-removal',
      'onnxruntime-web',
    ],
    esbuildOptions: {
      target: 'es2022',
      treeShaking: true,
    },
  },
  build: {
    // Use compatible targets for native WebViews (Chrome=Edge WebView2/Android, Safari=WKWebView/iOS)
    target: isNativeBuild ? ['chrome105', 'safari15'] : 'es2022',
    sourcemap: 'hidden',
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
      // Tauri packages are now handled by tauriStubPlugin for web builds
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
          // Core framework vendors
          'core-vendor': ['react', 'react-dom', 'react-router-dom'],
          'state-vendor': ['@tanstack/react-query', 'zustand'],
          'ui-vendor': ['react-tooltip', 'react-hook-form', 'react-dropzone'],
          'utils-vendor': ['lodash', 'uuid', 'dompurify'],
          'motion-vendor': ['motion'],

          // NEW: Additional vendor chunks for better code splitting
          'shared-vendor': ['@gruenerator/shared'],
          'canvas-vendor': ['konva', 'react-konva', 'use-image'],
          'ai-vendor': ['onnxruntime-web', '@imgly/background-removal'],
          'editor-vendor': ['@mdxeditor/editor', 'marked', 'react-markdown'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true, // Native apps expect exact port - fail if unavailable
    open: command === 'serve' && !isNativeBuild, // Don't auto-open browser for native app dev
    watch: {
      usePolling: true,
      ignored: [
        // Ignore external node_modules but allow workspace packages (symlinked by pnpm)
        '**/node_modules/.pnpm/**',
        '**/node_modules/.vite/**',
        '**/node_modules/.cache/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/.nyc_output/**',
        '**/tmp/**',
        '**/temp/**',
      ],
    },
    hmr: {
      host: 'localhost',
      port: 3000,
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
