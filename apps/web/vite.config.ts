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

// Build-only plugin: inject <link rel="preload"> for the fonts on the
// LCP critical path so the browser starts fetching them in parallel with
// CSS parsing instead of after it. Chrome DevTools traces showed
// Raleway-Regular (heading font, where the LCP text element renders) was
// the last node in the critical chain at ~3.3s. Asset filenames are
// content-hashed, so the plugin resolves the actual emitted filename from
// the build bundle at HTML-emit time rather than hardcoding a hash.
function preloadFontsPlugin(): Plugin {
  const TARGETS = [
    { pattern: /^assets\/fonts\/Raleway-Regular\..+\.woff2$/, type: 'font/woff2' },
    { pattern: /^assets\/fonts\/PTSans-Regular\..+\.woff2$/, type: 'font/woff2' },
  ];
  return {
    name: 'preload-critical-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const tags: string[] = [];
        for (const { pattern, type } of TARGETS) {
          const match = Object.keys(bundle).find((name) => pattern.test(name));
          if (!match) continue;
          tags.push(`<link rel="preload" as="font" type="${type}" href="/${match}" crossorigin>`);
        }
        if (tags.length === 0) return html;
        return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
      },
    },
  };
}

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
    preloadFontsPlugin(),
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
      '@gruenerator/voice': path.resolve(__dirname, '../../packages/voice/src'),
      '@gruenerator/sites': path.resolve(__dirname, '../../packages/sites/src'),
      '@gruenerator/sites-design': path.resolve(__dirname, '../../packages/sites-design/src'),
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
      // @gruenerator/core is imported transitively from the @gruenerator/shared
      // alias (shared/avatar + shared/models re-export from @gruenerator/core).
      // Same cascade rule as contracts above — alias it to src or Rolldown fails:
      //   "Rolldown failed to resolve import '@gruenerator/core/models'
      //    from packages/shared/src/models/index.ts".
      '@gruenerator/core': path.resolve(__dirname, '../../packages/core/src'),
    },
    // React MUST be deduped to a single physical copy. pnpm installs several
    // react versions (root 19.2.6, plus 19.2.3/19.2.4 nested under deps like
    // @tanstack/react-query); without dedupe, Rolldown links TWO Reacts into
    // the bundle. The second copy's dispatcher (ReactCurrentDispatcher.current)
    // is null, so the first hook call from a component that imported it —
    // QueryClientProvider's useEffect — throws "Cannot read properties of null
    // (reading 'useEffect')" and white-screens the whole app.
    // We CANNOT pin react via root pnpm.overrides (that forces mobile off its
    // Expo-locked react and breaks the RN renderer — see CLAUDE.md), so the
    // web bundle dedupes here instead.
    //
    // @assistant-ui/* MUST be deduped for the same reason: the runtime provider
    // (AuiProvider, lazy-loaded from @gruenerator/chat) and the thread-list
    // primitives are pulled through different entry points (workspace src via the
    // alias above vs. Vite's prebundled .vite/deps). Without dedupe they resolve
    // to TWO physical instances of the same version, so the React context set by
    // one is invisible to the other — "requires an AuiProvider" on /workplace
    // even though the provider is mounted above the consumer.
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'd3-path',
      '@assistant-ui/react',
      '@assistant-ui/tap',
      '@assistant-ui/core',
    ],
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
    //
    // EXCEPTION: `vendor-react` (the React runtime + react-query) is eager
    // core — it loads on every page — so it must STAY preloaded. The negative
    // lookahead keeps it while still dropping every other `vendor-*` leaf.
    // The catch-all core chunk is named `vendor` (no hyphen) so it is never
    // matched here and stays preloaded too.
    modulePreload: {
      polyfill: true,
      resolveDependencies: (_filename, deps) =>
        deps.filter((d) => {
          const base = d.split('/').pop() ?? '';
          return !/^(vendor-(?!react\.)|pkg-canvas-editor)/.test(base);
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
        // Code-splitting is ENABLED. It previously crashed prod three times —
        // the fix is the chunk topology below, which guarantees an ACYCLIC
        // chunk graph. Read this before touching the groups.
        //
        // The crash was always a cross-chunk module-init CYCLE: a chunk that
        // imports React initializes before the chunk holding React-DOM's (or
        // react-query's) module body has run, so its `React` binding is still
        // null → "Cannot read properties of null (reading 'useEffect')".
        // History: prod saw React-DOM's reconciler land in `vendor-blocknote-
        // export` and react-query (`useBaseQuery`) in its own auto-split chunk,
        // separate from React. The root cause was that the React runtime was
        // scattered across chunks AND the auto-splitter invented unpredictable
        // shared chunks for everything not explicitly named.
        //
        // Two rules kill the cycle:
        //  1. The WHOLE React runtime — react, react-dom, scheduler,
        //     use-sync-external-store AND @tanstack/react-query/-table — lives
        //     in ONE eagerly-loaded chunk (`vendor-react`, priority 100). They
        //     can never be split apart, so nothing ever sees a half-initialized
        //     React. (Previously react-query was omitted here — that was the
        //     bug.)
        //  2. A catch-all `vendor` group (lowest priority) absorbs every other
        //     node_module, so the auto-splitter never carves ad-hoc shared
        //     chunks. Edges only ever point INTO core (`leaf → vendor-react`,
        //     `vendor → vendor-react`); nothing points back into the leaves ⇒
        //     acyclic.
        //
        // Heavy leaf libs below are reachable ONLY via lazy() routes, so they
        // load on demand and stay off the homepage's critical path. Each size
        // comment is the source-byte size (gzip ≈ ÷4).
        //
        // CI compiles green even on a cycle — it only throws at runtime in the
        // browser. Validate any change to these groups with a browser smoke
        // test (load the app + each split route, assert no console error).
        //
        // Emergency rollback: set `VITE_SINGLE_BUNDLE=1` to ship the old single
        // bundle without a code change.
        ...(process.env.VITE_SINGLE_BUNDLE === '1'
          ? { codeSplitting: false }
          : {
              advancedChunks: {
                groups: [
                  {
                    // The entire React runtime in one chunk — see rule 1 above.
                    // react-query/-table MUST stay here with React.
                    name: 'vendor-react',
                    test: /[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|@tanstack[\\/](react-query|query-core|react-table))[\\/]/,
                    priority: 100,
                  },
                  // Heavy leaf libs (sorted by source size, largest first).
                  // Explicit `priority: 50` is REQUIRED: a group with no
                  // priority sorts BELOW the catch-all, so without it every lib
                  // falls into `vendor` and nothing splits. Must be < 100
                  // (vendor-react wins) and > the catch-all.
                  { name: 'vendor-excalidraw', test: /[\\/]node_modules[\\/]@excalidraw[\\/]/, priority: 50 }, // 4.7 MB
                  { name: 'vendor-mermaid', test: /[\\/]node_modules[\\/]mermaid[\\/]/, priority: 50 }, // 3.3 MB
                  {
                    name: 'vendor-blocknote-export',
                    test: /[\\/]node_modules[\\/]@blocknote[\\/]xl-/,
                    priority: 50,
                  }, // 3.3 MB combined
                  { name: 'vendor-react-pdf', test: /[\\/]node_modules[\\/]@react-pdf[\\/]/, priority: 50 }, // 1.4 MB
                  {
                    name: 'vendor-cytoscape',
                    test: /[\\/]node_modules[\\/]cytoscape(-[a-z-]+)?[\\/]/,
                    priority: 50,
                  }, // 1.5 MB combined
                  { name: 'vendor-docx', test: /[\\/]node_modules[\\/]docx[\\/]/, priority: 50 }, // 785 KB
                  { name: 'vendor-katex', test: /[\\/]node_modules[\\/]katex[\\/]/, priority: 50 }, // 584 KB
                  { name: 'vendor-fontkit', test: /[\\/]node_modules[\\/]fontkit[\\/]/, priority: 50 }, // 539 KB
                  {
                    name: 'vendor-recharts',
                    test: /[\\/]node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor)[\\/]/,
                    priority: 50,
                  }, // 519 KB
                  {
                    name: 'vendor-onnxruntime',
                    test: /[\\/]node_modules[\\/]onnxruntime-web[\\/]/,
                    priority: 50,
                  }, // 505 KB
                  { name: 'vendor-pptxgenjs', test: /[\\/]node_modules[\\/]pptxgenjs[\\/]/, priority: 50 }, // 505 KB
                  { name: 'vendor-konva', test: /[\\/]node_modules[\\/](konva|react-konva)[\\/]/, priority: 50 }, // 417 KB
                  {
                    name: 'vendor-collab',
                    test: /[\\/]node_modules[\\/](@hocuspocus|yjs|y-protocols|y-indexeddb|lib0)[\\/]/,
                    priority: 50,
                  }, // ~450 KB
                  { name: 'vendor-imgly', test: /[\\/]node_modules[\\/]@imgly[\\/]/, priority: 50 }, // 167 KB
                  // Catch-all — see rule 2 above. Priority 0: below the named
                  // groups (100 react, 50 leaves) so they win first; everything
                  // else (router, zustand, axios, radix, …) lands here in ONE
                  // predictable eager chunk instead of ad-hoc auto-split shared
                  // chunks. Named `vendor` (no hyphen) on purpose: the
                  // modulePreload filter drops `^vendor-` lazy leaves but keeps
                  // `vendor`, which is needed on every page.
                  {
                    name: 'vendor',
                    test: /[\\/]node_modules[\\/]/,
                    priority: 0,
                  },
                  // NOTE: do NOT add `pkg-canvas-editor` (or any other workspace
                  // package) here. canvas-editor ships React Providers/hooks and
                  // imports react-konva (already split into `vendor-konva`), so
                  // splitting it forms a cross-chunk init cycle: the canvas-editor
                  // chunk renders while its `react` import binding is still null →
                  // "Cannot read properties of null (reading 'useEffect')". This
                  // crashed prod on master (commit e49af52ea). Only node_modules
                  // are split; workspace packages stay in the entry graph.
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
  // `vite preview` serves the production build (apps/web/build). It does not
  // inherit `server.proxy`, so mirror the /api proxy here. Lets the bundle
  // smoke test (load the built app, assert no chunk init-cycle console errors)
  // run against a real backend. `VITE_PREVIEW_API` overrides the target so the
  // build can be pointed at the test/beta API instead of a local one.
  preview: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_PREVIEW_API || 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
}));
