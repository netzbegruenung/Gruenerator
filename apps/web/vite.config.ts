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
      'motion',
      'motion/react',
      'react-markdown',
      'lucide-react',
    ],
    // Keep heavy/native-binary deps out of prebundling — they handle their
    // own ESM and break esbuild's transformer (onnxruntime ships .wasm,
    // imgly ships ONNX models, browser-image-compression uses dynamic
    // workers).
    exclude: ['browser-image-compression', '@imgly/background-removal', 'onnxruntime-web'],
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
    // Vite's default modulePreload eagerly emits <link rel="modulepreload">
    // for every chunk reachable from the entry's static graph — including
    // the heavy named chunks declared in `advancedChunks.groups` below.
    // That defeats code-splitting: a 7 MB `vendor-blocknote-export` chunk
    // only used by the docs editor's Export action would be preloaded on
    // /login. Filter the preload list to drop those named lazy chunks; they
    // still load on-demand when their consuming route or action triggers
    // the dynamic import.
    modulePreload: {
      polyfill: true,
      resolveDependencies: (_filename, deps) =>
        deps.filter((d) => {
          const base = d.split('/').pop() ?? '';
          return !/^(vendor-|pkg-canvas-editor)/.test(base);
        }),
    },
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
        // Code-splitting strategy — leaf libraries only.
        //
        // History: commit 298ebe2f1 set `codeSplitting: false` after
        // Rolldown's auto-chunker produced chunks with module-init order
        // cycles, crashing prod with "TypeError: s is not a function"
        // (react-markdown chunk) and "Cannot read properties of undefined
        // (reading 'displayName')" (radix-ui Primitive chunk). The pre-298ebe2f1
        // config nested `groups` directly under `codeSplitting`, which Rolldown
        // silently dropped (the boolean|schema union accepted the object but
        // the schema requires `groups` under `advancedChunks`, not under
        // `codeSplitting`). Result: no manual chunking ever applied.
        //
        // This config uses `output.advancedChunks.groups` (the correct
        // location) to name chunks for heavy LEAF libraries only — libs
        // that export no Providers, hold no shared singletons, and are
        // imported only inside lazy route components. Therefore none can participate in a
        // cross-chunk init cycle: no other chunk reads from them at
        // module-init time. React, Radix, react-markdown, and the workspace
        // packages (`@gruenerator/ui`, `@gruenerator/chat`, etc.) are
        // deliberately NOT split — they stay in the entry chunk where they
        // are today, eliminating the original failure mode.
        //
        // Set `VITE_SINGLE_BUNDLE=1` in the environment for a one-redeploy
        // revert to the pre-splitting single-bundle build with no code
        // change. Each named chunk's size comment is the source-byte size
        // measured from the analyzer; gzip is roughly ÷4.
        ...(process.env.VITE_SINGLE_BUNDLE === '1'
          ? { codeSplitting: false }
          : {
              advancedChunks: {
                groups: [
                  // Heavy leaf libs (sorted by source size, largest first)
                  { name: 'vendor-excalidraw', test: /[\\/]node_modules[\\/]@excalidraw[\\/]/ }, // 4.7 MB
                  { name: 'vendor-mermaid', test: /[\\/]node_modules[\\/]mermaid[\\/]/ }, // 3.3 MB
                  {
                    name: 'vendor-blocknote-export',
                    test: /[\\/]node_modules[\\/]@blocknote[\\/]xl-/,
                  }, // 3.3 MB combined
                  { name: 'vendor-react-pdf', test: /[\\/]node_modules[\\/]@react-pdf[\\/]/ }, // 1.4 MB
                  {
                    name: 'vendor-cytoscape',
                    test: /[\\/]node_modules[\\/]cytoscape(-[a-z-]+)?[\\/]/,
                  }, // 1.5 MB combined
                  { name: 'vendor-docx', test: /[\\/]node_modules[\\/]docx[\\/]/ }, // 785 KB
                  { name: 'vendor-katex', test: /[\\/]node_modules[\\/]katex[\\/]/ }, // 584 KB
                  { name: 'vendor-fontkit', test: /[\\/]node_modules[\\/]fontkit[\\/]/ }, // 539 KB
                  {
                    name: 'vendor-recharts',
                    test: /[\\/]node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor)[\\/]/,
                  }, // 519 KB
                  {
                    name: 'vendor-onnxruntime',
                    test: /[\\/]node_modules[\\/]onnxruntime-web[\\/]/,
                  }, // 505 KB
                  { name: 'vendor-pptxgenjs', test: /[\\/]node_modules[\\/]pptxgenjs[\\/]/ }, // 505 KB
                  { name: 'vendor-konva', test: /[\\/]node_modules[\\/](konva|react-konva)[\\/]/ }, // 417 KB
                  {
                    name: 'vendor-collab',
                    test: /[\\/]node_modules[\\/](@hocuspocus|yjs|y-protocols|y-indexeddb|lib0)[\\/]/,
                  }, // ~450 KB
                  { name: 'vendor-imgly', test: /[\\/]node_modules[\\/]@imgly[\\/]/ }, // 167 KB
                  { name: 'pkg-canvas-editor', test: /[\\/]packages[\\/]canvas-editor[\\/]/ }, // 1.4 MB
                ],
              },
            }),
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
