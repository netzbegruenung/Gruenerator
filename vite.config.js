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
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 4096, // Optimierte Asset-Größe
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash][extname]',
        entryFileNames: 'js/[name].[hash].js',
        chunkFileNames: 'js/[name].[hash].js',
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom']
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
