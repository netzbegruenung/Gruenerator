import fs from 'fs';
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
        connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:', 'https://app.glitchtip.com'],
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
const API_TARGET = process.env.API_TARGET || process.env.VITE_API_TARGET || 'http://api:3001';
app.use(
  ['/api', '/auth'],
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    cookieDomainRewrite: '',
  })
);
console.log(`[Docs] API proxy: /api → ${API_TARGET}`);

// Serve static files from dist
app.use(
  express.static(DIST_PATH, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      // index.html must not be cached — it references hashed chunks that change on each deploy
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    },
  })
);

// Missing assets should 404, not fall through to SPA (prevents serving index.html as JS)
app.use('/assets', (_req, res) => {
  res.status(404).end();
});
app.use('/fonts', (_req, res) => {
  res.status(404).end();
});

// OG meta tag injection for social crawler link previews
const DOCS_BASE_URL = process.env.DOCS_BASE_URL || 'https://docs.gruenerator.eu';
const CRAWLER_UA =
  /facebookexternalhit|Twitterbot|Slackbot|LinkedInBot|Discordbot|WhatsApp|TelegramBot|Applebot/i;
const DOC_ROUTE = /^\/document\/([a-f0-9-]+)$/i;

let indexHtmlTemplate = '';
try {
  indexHtmlTemplate = fs.readFileSync(path.join(DIST_PATH, 'index.html'), 'utf-8');
} catch {
  console.warn(
    '[Docs] Could not pre-read index.html for OG injection — will fall back to sendFile'
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

app.get('/document/:id', async (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!CRAWLER_UA.test(ua) || !indexHtmlTemplate) {
    return next();
  }

  const match = DOC_ROUTE.exec(req.path);
  if (!match) return next();
  const docId = match[1];

  try {
    const ogRes = await fetch(`${API_TARGET}/api/docs/public/${encodeURIComponent(docId!)}/og`);
    if (!ogRes.ok) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(indexHtmlTemplate);
    }

    const og = (await ogRes.json()) as {
      title: string;
      preview_text: string | null;
      document_subtype: string;
      share_mode: string;
    };

    const title = escapeHtml(og.title || 'Grünerator Docs');
    const description = escapeHtml(og.preview_text || 'Kollaborativer Dokumenteneditor');
    const url = `${DOCS_BASE_URL}/document/${docId}`;
    const image = `${DOCS_BASE_URL}/images/og-preview.svg`;

    const ogTags = `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Grünerator Docs" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />`;

    const html = indexHtmlTemplate
      .replace(/<meta property="og:[^>]+>\s*/g, '')
      .replace(/<meta name="twitter:[^>]+>\s*/g, '')
      .replace('</head>', `${ogTags}\n  </head>`)
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('[Docs] OG injection failed:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.send(indexHtmlTemplate);
  }
});

// SPA fallback - send all non-matched requests to index.html
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
