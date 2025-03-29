import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ command }) => ({
  plugins: [
    react({
      jsxRuntime: 'automatic',
      babel: {
        plugins: ['babel-plugin-macros']
      }
    })
  ],

  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: []
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, './')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },

  optimizeDeps: {
    esbuildOptions: {
      // loader: {             // <-- Auskommentiert
      //   '.js': 'jsx'
      // }
    },
    include: ['react', 'react-dom']
  },

  build: {
    outDir: 'build',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
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
          // Separate React core libraries
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Catch-all for other node_modules
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          // Keep app code logic (can be refined further if needed)
          if (id.includes('/features/') || id.includes('/components/')) {
            return 'app';
          }
        }
      }
    }
  },

  server: {
    port: 3000,
    open: command === 'serve',
    hmr: {
      overlay: false
    },
    watch: {
      usePolling: false
    }
  }
})) 