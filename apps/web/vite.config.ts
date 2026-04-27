import path from 'node:path';
import { fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect Tauri build environment - set by Tauri CLI during builds
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

// Native app detection (Tauri desktop)
const isNativeBuild = isTauri;

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

export default defineConfig(({ command }) => ({
  // Use relative paths for native builds so assets resolve correctly
  base: isNativeBuild ? './' : '/',
  plugins: [
    // Only use Tauri stub plugin when NOT in Tauri context
    ...(!isTauri ? [tauriStubPlugin()] : []),
    react({ jsxRuntime: 'automatic' }),
    ...(command === 'build' ? [babel({ presets: [reactCompilerPreset()] })] : []),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, './'),
      '@gruenerator/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@gruenerator/chat': path.resolve(__dirname, '../../packages/chat/src'),
      // @gruenerator/contracts is imported transitively from within the
      // @gruenerator/shared alias path (e.g. shared/api/contractsClient.ts
      // imports notebookContract from @gruenerator/contracts). Vite's alias
      // system doesn't cascade through workspace deps — any package aliased
      // to src/ must have ALL its workspace-package imports explicitly
      // aliased too, otherwise Rolldown's resolver can't find the source.
      // This surfaced in CI as:
      //   "Rolldown failed to resolve import '@gruenerator/contracts'
      //    from packages/shared/src/api/contractsClient.ts"
      '@gruenerator/contracts': path.resolve(__dirname, '../../packages/contracts/src'),
    },
    dedupe: ['d3-path'],
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
      '@assistant-ui/react',
      'recharts',
    ],
    exclude: ['motion', 'browser-image-compression', '@imgly/background-removal'],
    rolldownOptions: {
      transform: {
        define: {},
      },
      treeshake: true,
    },
  },
  build: {
    // Use compatible targets for native WebViews (Chrome=Edge WebView2, Safari=WKWebView)
    target: isNativeBuild ? ['chrome105', 'safari15'] : ['es2022', 'safari15'],
    sourcemap: 'hidden',
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 300,
    outDir: 'build',
    reportCompressedSize: false,
    modulePreload: { polyfill: true },
    cssMinify: true,
    emptyOutDir: true,
    rolldownOptions: {
      treeshake: true,
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
        // Disable code-splitting entirely as an emergency safety measure.
        //
        // The previous `codeSplitting.groups` config has been silently dead
        // since the Vite 8 → Rolldown migration: Rolldown's `codeSplitting`
        // accepts either a boolean or `AdvancedChunksSchema`, but
        // AdvancedChunksSchema does not include a `groups` field, so the
        // entire vendor-grouping block was being dropped at config parse.
        // With no manual chunking active, Rolldown's auto-chunker had been
        // producing a chunk topology with multiple circular cross-chunk
        // imports — surfacing in production as both
        //   "TypeError: s is not a function" (in the react-markdown chunk,
        //    where bindings from the still-initializing entry chunk were
        //    used at module-init time)
        // and
        //   "Cannot read properties of undefined (reading 'displayName')"
        //    (at radix-ui's Primitive factory in another chunk, same root
        //    cause: a sibling-chunk binding undefined at use time).
        //
        // `codeSplitting: false` puts all modules into one chunk and
        // inlines every dynamic `import()`, eliminating all cross-chunk
        // imports and therefore any possibility of circular-init bugs.
        // The cost is initial bundle size (no on-demand splits) — a real
        // regression we'll claw back in a follow-up PR with a working
        // chunking config plus a CI smoke test that catches cycles.
        codeSplitting: false,
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
        ws: true,
        ...(process.env.VITE_E2E_AUTH_BYPASS === 'true' && {
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-dev-auth-bypass', process.env.VITE_DEV_AUTH_BYPASS_TOKEN || '');
            });
          },
        }),
      },
    },
  },
}));
