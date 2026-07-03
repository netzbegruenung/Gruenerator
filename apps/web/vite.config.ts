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
  // Always use an absolute base. The Tauri webview serves the bundle from the
  // `tauri://localhost/` origin, so absolute `/assets/...` URLs resolve
  // correctly regardless of route depth. A relative base (`./`) only works at
  // the root route — on a deeper route like `/docs/:id` the webview resolves
  // `./assets/...` against `/docs/`, hits the SPA index.html fallback, and the
  // main stylesheet/chunks fail to load (symptom: docs editor renders as a
  // blank white page).
  base: '/',
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
      // Subpath export must be listed BEFORE the bare alias — the bare
      // src/ mapping would otherwise resolve it to a nonexistent path.
      '@gruenerator/contracts/sites-richtext': path.resolve(
        __dirname,
        '../../packages/contracts/src/richtext/index.ts'
      ),
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
      '@tiptap/react',
      '@tiptap/core',
      // '@tiptap/pm' has no root export since 3.26 — pre-bundling the meta
      // package crashes the dev server; the subpath imports resolve fine.
      '@tiptap/static-renderer',
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
    exclude: [
      'browser-image-compression',
      '@imgly/background-removal',
      'onnxruntime-web',
      'pyodide',
    ],
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
    // CSS IS code-split per chunk. Combined with the natural JS splitting below
    // (only `vendor-react` is forced), each lazy route's CSS rides with its own
    // async chunk — the homepage eager-links ONLY the global `index.css`, not
    // the excalidraw/blocknote/editor CSS it never uses.
    //
    // This was unsafe before because canvas-editor had an internal sidebar↔configs
    // module-init cycle that crashed under natural splitting; that cycle is now
    // broken at the source (presentation tokens moved to a leaf module), so
    // per-chunk CSS is safe. Rollback: `VITE_SINGLE_BUNDLE=1` ships one bundle.
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
        // Filenames are `<sanitized-name>-[hash]` — a HYPHEN before the hash and
        // NO dots in the name part. Reason: the system nginx security filter
        // (blocked-paths-regex, case-insensitive `\.sh|\.env|\.conf|\.log|…`,
        // unanchored) 404s any path containing a `.<blockedExt>` segment. Two
        // ways a build asset could trip it: (1) a content hash starting with a
        // blocked ext after a dot — e.g. `index.sHm9A0Iy.css` matched `.sh`; and
        // (2) a chunk NAME containing a dotted ext — e.g. the canvas-editor
        // `dreizeilen_full.config-….js` matched `.conf`. Using a hyphen before
        // the hash kills (1); replacing dots in the name kills (2). Net: the
        // only dot left in any emitted filename is the real extension (.js/.css/
        // …), none of which are blocked. Verified post-build by running the exact
        // regex over every emitted filename (must be zero matches).
        entryFileNames: (chunk) => `assets/js/${chunk.name.replace(/\./g, '-')}-[hash].js`,
        chunkFileNames: (chunk) => `assets/js/${chunk.name.replace(/\./g, '-')}-[hash].js`,
        assetFileNames(assetInfo) {
          const name = assetInfo.names?.[0] || '';
          // base = name without its final extension, with any remaining dots
          // replaced by hyphens. `[extname]` re-appends the real extension.
          const base = name.replace(/\.[^.]+$/, '').replace(/\./g, '-') || 'asset';
          if (name.endsWith('.jsx') || name.endsWith('.tsx')) {
            return `assets/js/${base}-[hash].js`;
          }
          const ext = name.split('.').pop() || '';
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp/i.test(ext)) {
            return `assets/images/${base}-[hash][extname]`;
          }
          if (/css/i.test(ext)) {
            return `assets/css/${base}-[hash][extname]`;
          }
          if (/woff2?|ttf|eot/i.test(ext)) {
            return `assets/fonts/${base}-[hash][extname]`;
          }
          return `assets/${base}-[hash][extname]`;
        },
        // NATURAL code-splitting: the ONLY forced group is `vendor-react`.
        // Everything else (app code, workspace packages, node_modules) is split
        // by Rolldown's own reachability analysis, so a library reached only via
        // a lazy() route lands in that route's async chunk — and so does its CSS
        // (cssCodeSplit:true above). This is what keeps excalidraw/blocknote/etc.
        // CSS off the homepage's eager path.
        //
        // Why only `vendor-react`: the historical prod crashes were a cross-chunk
        // module-init CYCLE where a chunk importing React initialized before the
        // chunk holding React-DOM/react-query, so `React` was null → "Cannot read
        // properties of null (reading 'useEffect')". Pinning the ENTIRE React
        // runtime — react, react-dom, scheduler, use-sync-external-store AND
        // @tanstack/react-query/-table — into one eager chunk means no async
        // chunk can ever see a half-initialized React. react-query/-table MUST
        // stay here.
        //
        // The previous design ALSO used a catch-all `vendor` chunk + named heavy
        // leaf groups to tame the auto-splitter. That was only needed because
        // canvas-editor had an internal sidebar↔configs init cycle that the
        // auto-splitter exposed across chunks. That cycle is now broken at the
        // source (presentation tokens extracted to a leaf module; the two
        // ineffective internal dynamic imports made static), so natural splitting
        // is cycle-free and the manual groups are no longer required.
        //
        // Validate any change with a browser smoke test (load the app + each
        // heavy route, force-import the lazy chunks, assert no console init
        // error). Rollback: `VITE_SINGLE_BUNDLE=1` ships one bundle.
        ...(process.env.VITE_SINGLE_BUNDLE === '1'
          ? { codeSplitting: false }
          : {
              advancedChunks: {
                groups: [
                  {
                    name: 'vendor-react',
                    test: /[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|@tanstack[\\/](react-query|query-core|react-table))[\\/]/,
                    priority: 100,
                  },
                ],
              },
            }),
      },
    },
  },
  server: {
    // VITE_DEV_PORT lets a second checkout/worktree run its dev server next to
    // the default one on 3000 (HMR must follow, see below).
    port: Number(process.env.VITE_DEV_PORT ?? 3000),
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
      port: Number(process.env.VITE_DEV_PORT ?? 3000),
      overlay: false,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API || 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        ...(process.env.VITE_E2E_AUTH_BYPASS === 'true' && {
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-dev-auth-bypass', process.env.VITE_DEV_AUTH_BYPASS_TOKEN || '');
              // On a non-default VITE_DEV_PORT the backend's CORS allowlist
              // doesn't know this origin — present as the canonical dev origin.
              if (process.env.VITE_DEV_PORT) {
                proxyReq.setHeader('origin', 'http://localhost:3000');
              }
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
