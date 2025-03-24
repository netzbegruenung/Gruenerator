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
      loader: {
        '.js': 'jsx'
      }
    },
    include: ['react', 'react-dom']
  },

  build: {
    outDir: 'build',
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
            return 'vendor-common';
          }
          
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
    }
  },

  server: {
    port: 3000,
    open: command === 'serve',
    hmr: {
      overlay: false
    },
    watch: {
      usePolling: true
    }
  }
})) 