import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [
    react({
      // Aktiviert den neuen JSX-Transform für React 17+
      jsxRuntime: 'automatic',
      babel: {
        plugins: ['babel-plugin-macros']
      }
    })
  ],

  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/, // Behandelt sowohl .js als .jsx
    exclude: [],
    jsxInject: `import React from 'react'` // Sicherstellt JSX-Pragma
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, './') // Root-Alias hinzugefügt
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },

  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx' // Explizite Loader-Definition
      },
      plugins: [
        {
          name: 'jsx-in-js',
          setup(build) {
            build.onLoad({ filter: /src\/.*\.js$/ }, (args) => ({
              loader: 'jsx',
              contents: fs.readFileSync(args.path, 'utf8')
            }))
          }
        }
      ]
    },
    include: ['react', 'react-dom'] // Explizite Dependency-Optimierung
  },

  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          // Gruppiere Assets nach Typ in Unterordner
          const extType = assetInfo.name.split('.').pop();
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            return `assets/images/[name].[hash][extname]`;
          }
          if (/css/i.test(extType)) {
            return `assets/css/[name].[hash][extname]`;
          }
          return `assets/[name].[hash][extname]`;
        },
        entryFileNames: 'assets/js/[name].[hash].js',
        chunkFileNames: 'assets/js/[name].[hash].js',
        manualChunks: (id) => {
          // Vendor-Chunks für häufig verwendete Bibliotheken
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler') || id.includes('prop-types')) {
              return 'vendor-react';
            }
            if (id.includes('react-router')) {
              return 'vendor-router';
            }
            if (id.includes('lottie') || id.includes('animation')) {
              return 'vendor-animation';
            }
            if (id.includes('axios') || id.includes('query')) {
              return 'vendor-data';
            }
            if (id.includes('redux') || id.includes('zustand') || id.includes('recoil')) {
              return 'vendor-state';
            }
            // Alle anderen node_modules in einen gemeinsamen Chunk
            return 'vendor-common';
          }
          
          // Feature-basierte Chunks für Anwendungscode
          if (id.includes('/features/texte/')) {
            return 'feature-texte';
          }
          if (id.includes('/features/sharepic/') || id.includes('/features/subtitler/')) {
            return 'feature-media';
          }
          if (id.includes('/features/voice/') || id.includes('/features/universal/')) {
            return 'feature-ai';
          }
          if (id.includes('/features/templates/') || id.includes('/features/campaigns/')) {
            return 'feature-templates';
          }
          if (id.includes('/features/search/') || id.includes('/features/you/')) {
            return 'feature-user';
          }
          if (id.includes('/components/common/') || id.includes('/components/utils/')) {
            return 'common-components';
          }
        }
      }
    },
    emptyOutDir: true // Sichert leeren Build-Ordner
  },

  server: {
    port: 3000,
    open: command === 'serve', // Nur im Dev-Mode öffnen
    hmr: {
      overlay: false // Deaktiviert Fehler-Overlay
    },
    watch: {
      usePolling: true // Für Docker/WSL2 optimiert
    }
  }
}));
