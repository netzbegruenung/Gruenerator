import { createServer } from 'http';
import path from 'path';

import compression from 'compression';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Load environment variables (process.cwd() = WORKDIR in Docker = apps/docs/)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST_PATH = path.join(process.cwd(), 'dist');

/**
 * Production Server for Grünerator Docs
 *
 * Serves the static frontend build (Vite SPA).
 * Hocuspocus WebSocket server runs as a separate service.
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

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'gruenerator-docs',
  });
});

// Proxy /api and /auth requests to the API backend
const API_TARGET = process.env.VITE_API_TARGET || 'http://api:3001';
app.use(
  ['/api', '/auth'],
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    cookieDomainRewrite: '',
    on: {
      proxyReq: (proxyReq, req) => {
        if (req.headers.cookie) {
          proxyReq.setHeader('cookie', req.headers.cookie);
        }
      },
    },
  })
);
console.log(`[Docs] API proxy configured: /api → ${API_TARGET}`);

// Serve static files from dist
app.use(
  express.static(DIST_PATH, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
  })
);

// SPA fallback - send all non-matched requests to index.html
app.use((_req, res) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

// Create HTTP server
const httpServer = createServer(app);

// Start server
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Grünerator Docs server listening on http://0.0.0.0:${PORT}`);
  console.log(`Serving static files from: ${DIST_PATH}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
