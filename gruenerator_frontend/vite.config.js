import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Hier kannst du Pfad-Aliase definieren, falls du sie in deinem Projekt verwendest
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Optimierungen für den Build-Prozess
  build: {
    // Chunk-Größe optimieren
    chunkSizeWarningLimit: 1000,
    // Bessere Code-Splitting-Strategie
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Weitere manuelle Chunks können hier definiert werden
        },
      },
    },
  },
  // Entwicklungsserver-Konfiguration
  server: {
    port: 3000, // Gleicher Port wie bei CRA
    open: true,
  },
}); 