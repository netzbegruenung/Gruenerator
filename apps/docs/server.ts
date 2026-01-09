import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import helmet from 'helmet';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { startHocuspocusServer } from '../api/services/hocuspocus/hocuspocusServer.js';

// Load environment variables
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env.local') });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST_PATH = path.join(__dirname, 'dist');

/**
 * Production Server for Grünerator Docs
 *
 * This server serves:
 * 1. Static frontend build (Vite SPA)
 * 2. Hocuspocus WebSocket server for collaborative editing
 */

// Security headers with CSP for WebSocket support
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Compression
app.use(compression());

// Parse JSON bodies
app.use(express.json());

// Health check endpoint (important for Coolify)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'gruenerator-docs'
  });
});

// Serve static files from dist
app.use(express.static(DIST_PATH, {
  maxAge: '1y',
  etag: true,
  lastModified: true,
}));

// SPA fallback - send all non-matched requests to index.html
app.use((_req, res) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

// Create HTTP server
const httpServer = createServer(app);

// Start servers
async function startServers() {
  try {
    console.log('Starting Grünerator Docs server...');

    // Start Hocuspocus WebSocket server
    console.log('Starting Hocuspocus WebSocket server...');
    await startHocuspocusServer();

    // Start HTTP server for static files
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ HTTP server listening on http://0.0.0.0:${PORT}`);
      console.log(`✓ Serving static files from: ${DIST_PATH}`);
      console.log(`✓ Hocuspocus WebSocket server running`);
      console.log('Server is ready!');
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down gracefully...');
      httpServer.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
}

// Start the servers
startServers();
