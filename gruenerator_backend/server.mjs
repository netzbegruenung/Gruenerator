import express from 'express';
import cluster from 'cluster';
import os from 'os';
import compression from 'compression';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import winston from 'winston';
import multer from 'multer';
import axios from 'axios';
import { createRequire } from 'module';

import routesModule from './routes.js';
const { setupRoutes } = routesModule;

import AiWorkerPoolModule from './workers/aiWorkerPool.js';
const AIWorkerPool = AiWorkerPoolModule;

import tusServiceModule from './routes/subtitler/services/tusService.js';
const { tusServer } = tusServiceModule;

import session from 'express-session';
import {RedisStore} from 'connect-redis';
import passport from './config/passportSetup.mjs';

const require = createRequire(import.meta.url);

const numCPUs = os.cpus().length;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let aiWorkerPool;
let masterShutdownInProgress = false;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  const workerCount = parseInt(process.env.WORKER_COUNT, 10) || 2;
  console.log(`Starting ${workerCount} workers (WORKER_COUNT: ${workerCount})`);

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    if (!worker.exitedAfterDisconnect && !masterShutdownInProgress) {
      console.log('Starting new worker...');
      cluster.fork();
    }
  });

  const masterShutdown = async (signal) => {
    if (masterShutdownInProgress) {
      console.log(`Master shutdown already in progress, ignoring ${signal}`);
      return;
    }
    masterShutdownInProgress = true;
    
    console.log(`Master received ${signal}, initiating graceful shutdown...`);

    const workers = Object.values(cluster.workers);
    workers.forEach(worker => {
      worker.disconnect();
    });

    const shutdownPromises = workers.map(worker => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log(`Worker ${worker.process.pid} shutdown timeout, forcing kill`);
          worker.kill('SIGKILL');
          resolve();
        }, 10000); // 10 Sekunden Timeout
        
        worker.send({ type: 'shutdown' });
        worker.on('message', (msg) => {
          if (msg.type === 'shutdown-complete') {
            clearTimeout(timeout);
            console.log(`Worker ${worker.process.pid} shutdown complete`);
            resolve();
          }
        });
        
        worker.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    await Promise.all(shutdownPromises);

    console.log('All workers shut down successfully');
    process.exit(0);
  };

  process.on('SIGTERM', () => masterShutdown('SIGTERM'));
  process.on('SIGINT', () => masterShutdown('SIGINT'));
} else {

  const app = express();
  let workerShutdownInProgress = false;

  const redisClient = require('./utils/redisClient.js');

  // Security: Environment-based CORS configuration
  const productionOrigins = [
    'https://gruenerator-test.de',
    'https://www.gruenerator-test.de',
    'https://gruenerator.netzbegruenung.verdigado.net',
    'https://www.gruenerator.netzbegruenung.verdigado.net',
    'https://gruenerator.de',
    'https://www.gruenerator.de',
    'https://beta.gruenerator.de',
    'https://www.beta.gruenerator.de',
    'https://gruenerator-test.netzbegruenung.verdigado.net',
    'https://www.gruenerator-test.netzbegruenung.verdigado.net',
    'https://xn--grenerator-test-4pb.de',
    'https://www.xn--grenerator-test-4pb.de',
    'https://xn--grenerator-z2a.xn--netzbegrnung-dfb.verdigado.net',
    'https://www.xn--grenerator-z2a.xn--netzbegrnung-dfb.verdigado.net',
    'https://xn--grenerator-z2a.de',
    'https://www.xn--grenerator-z2a.de',
    'https://beta.xn--grenerator-z2a.de',
    'https://www.beta.xn--grenerator-z2a.de',
    'https://xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net',
    'https://www.xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net',
    'https://www.xn--grnerator-z2a.xn--netzbegrnung-dfb.verdigado.net',
  ];

  const developmentOrigins = [
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://localhost:3001',
  ];

  // Use production origins only in production, include development origins in development
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? productionOrigins
    : [...productionOrigins, ...developmentOrigins];

  const corsOptions = {
    origin: function (origin, callback) {
      // Fallback: If nginx strips Origin header, reconstruct from X-Forwarded-Host
      let effectiveOrigin = origin;
      if (!origin && this && this.headers) {
        const forwardedHost = this.headers['x-forwarded-host'];
        const forwardedProto = this.headers['x-forwarded-proto'] || 'https';
        if (forwardedHost) {
          effectiveOrigin = `${forwardedProto}://${forwardedHost}`;
        }
      }

      // Security: Strict origin checking - no bypass for missing origins
      if (!effectiveOrigin) {
        console.warn('[CORS] Request with no origin header - allowing (may be same-origin request)');
        callback(null, true);
        return;
      }

      if (allowedOrigins.indexOf(effectiveOrigin) !== -1) {
        callback(null, true);
      } else {
        console.error(`[CORS] Origin BLOCKED: ${effectiveOrigin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Range',
      // Add TUS specific headers
      'Upload-Length',
      'Upload-Offset',
      'Tus-Resumable',
      'Upload-Metadata',
      'Upload-Defer-Length', // If using defer length extension
      'Upload-Concat' // If using concatenation extension
    ],
    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Type',
      // Add TUS specific headers
      'Upload-Offset',
      'Location',
      'Tus-Resumable'
    ],
    credentials: true,
    optionsSuccessStatus: 204
  };

  app.use(cors(corsOptions));

  // Security: Reduced request size limits to prevent DoS attacks
  // Specific upload routes (video, images) use multer with their own limits
  app.use(express.json({limit: '10mb'}));
  app.use(express.raw({limit: '10mb'}));
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  app.use((req, res, next) => {
    res.setTimeout(900000); // 15 Minuten
    next();
  });

  const aiWorkerCount = parseInt(process.env.AI_WORKER_COUNT, 10) || 6;
  console.log(`Initializing AI worker pool with ${aiWorkerCount} workers (with Redis support for privacy mode)`);
  aiWorkerPool = new AIWorkerPool(aiWorkerCount, redisClient);
  app.locals.aiWorkerPool = aiWorkerPool;

  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const aiSearchAgent = require('./services/aiSearchAgent.js');
    aiSearchAgent.setAIWorkerPool(aiWorkerPool);
    console.log('AI Search Agent initialized with worker pool');
  } catch (error) {
    console.error('Warning: Could not initialize AI Search Agent:', error.message);
  }

  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const SharepicImageManager = require('./services/sharepicImageManager.js');
    const sharepicImageManager = new SharepicImageManager(redisClient);
    app.locals.sharepicImageManager = sharepicImageManager;
    console.log(`[Worker ${process.pid}] SharepicImageManager initialized with Redis client`);
  } catch (error) {
    console.error(`[Worker ${process.pid}] Warning: Could not initialize SharepicImageManager:`, error.message);
  }

  try {
    const { getPostgresInstance } = await import('./database/services/PostgresService.js');
    const postgresService = getPostgresInstance();
    console.log(`[Worker ${process.pid}] Initializing PostgreSQL connection...`);
    await postgresService.init(); // This now only does connection + pool setup
    console.log(`[Worker ${process.pid}] PostgreSQL connection initialized successfully`);
  } catch (error) {
    console.error(`[Worker ${process.pid}] Warning: Could not initialize PostgreSQL connection:`, error.message);
  }

  try {
    const { getProfileService } = await import('./services/ProfileService.js');
    const profileService = getProfileService();
    await profileService.init();
    console.log(`[Worker ${process.pid}] ProfileService initialized successfully`);
  } catch (error) {
    console.error(`[Worker ${process.pid}] Warning: Could not initialize ProfileService:`, error.message);
  }

  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6
  }));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.unsplash.com"],
        connectSrc: [
          "'self'",
          "https://*.supabase.co", 
          // Alle Subdomains von gruenerator.de (HTTP & HTTPS, falls lokal noch HTTP gebraucht wird)
          "http://*.gruenerator.de",
          "https://*.gruenerator.de",
          // Umlaut-Domain grüenerator.de + Subdomains (Punycode-kodiert)
          "http://*.xn--grnerator-z2a.de",
          "https://*.xn--grnerator-z2a.de",
          // Weiterhin lokale Entwicklungs-URLs
          "http://localhost:*",
          "http://127.0.0.1:*",
          // WebSocket connections for Y.js collaborative editing
          "ws://localhost:*",
          "ws://127.0.0.1:*",
          // Falls *.netzbegruenung* genutzt wird
          "http://*.netzbegruenung.verdigado.net",
          "https://*.netzbegruenung.verdigado.net",
          // Zusätzliche erlaubte Domains
          ...allowedOrigins,
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  }));

  const desiredPort = process.env.PORT || 3001;
  const host = process.env.HOST || "127.0.0.1";

  process.on('message', async (msg) => {
    if (msg.type === 'shutdown' && !workerShutdownInProgress) {
      workerShutdownInProgress = true;
      console.log(`Worker ${process.pid} received shutdown signal`);

      try {
        if (aiWorkerPool) {
          console.log('Shutting down AI worker pool...');
          await aiWorkerPool.shutdown();
        }

        if (redisClient && redisClient.isOpen) {
          console.log('Closing Redis connection...');
          await redisClient.quit();
        }

        server.close(() => {
          console.log(`Worker ${process.pid} server closed`);
          if (process.send) {
            process.send({ type: 'shutdown-complete' });
          }
          process.exit(0);
        });
      } catch (error) {
        console.error(`Error during worker ${process.pid} shutdown:`, error);
        if (process.send) {
          process.send({ type: 'shutdown-complete' });
        }
        process.exit(1);
      }
    }
  });

  const workerShutdown = async (signal) => {
    if (workerShutdownInProgress) {
      console.log(`Worker ${process.pid} shutdown already in progress, ignoring ${signal}`);
      return;
    }
    workerShutdownInProgress = true;
    
    console.log(`Worker ${process.pid} received ${signal}`);
    try {
      if (aiWorkerPool) {
        await aiWorkerPool.shutdown();
      }
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
      }
      server.close(() => {
        console.log(`Worker ${process.pid} server closed`);
        process.exit(0);
      });
    } catch (error) {
      console.error(`Error during worker ${process.pid} shutdown:`, error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => workerShutdown('SIGTERM'));
  process.on('SIGINT', () => workerShutdown('SIGINT'));

  const cacheMiddleware = async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }
    
    const key = `cache:${req.originalUrl}`;
    try {
      const cachedResponse = await redisClient.get(key);
      if (cachedResponse) {
        return res.send(JSON.parse(cachedResponse));
      }

      const originalSend = res.send;
      res.send = function(body) {
        if (!req.originalUrl.startsWith('/api/')) {
          redisClient.set(key, JSON.stringify(body), {
            EX: 3600 // 1 Stunde Cache
          }).catch(err => console.error('[Cache] Error setting cache:', err));
        }
        return originalSend.call(this, body);
      };
      next();
    } catch (err) {
      console.error('[Cache] Error:', err);
      next();
    }
  };

  // Session and Authentication setup
  console.log('[Server.mjs] Setting up session middleware...');

  // Commented out for mobile-only usage - uncomment when sessions are needed
  // if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  //   console.error('[CRITICAL] SESSION_SECRET must be set and at least 32 characters');
  //   process.exit(1);
  // }

  // Use SESSION_SECRET if available, otherwise use fallback with warning
  const sessionSecret = process.env.SESSION_SECRET || 'temporary-fallback-secret-for-mobile-only';
  if (!process.env.SESSION_SECRET) {
    console.warn('[WARNING] SESSION_SECRET not set - using temporary fallback. Set SESSION_SECRET for production!');
  }

  app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true, // Changed to true to support anonymous user rate limiting
    name: 'gruenerator.sid', // Custom session name to avoid conflicts
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (extended for anonymous session tracking)
      sameSite: 'lax', // Use 'lax' for OAuth flows - 'strict' blocks cross-site redirects from Keycloak
      domain: process.env.NODE_ENV === 'production' ? undefined : undefined, // Don't set domain in development
      path: '/' // Ensure cookie is available for all paths
    }
  }));
  
  console.log('[Server.mjs] Session middleware setup complete.');

  // Passport middleware
  console.log('[Server.mjs] Initializing Passport...');
  app.use(passport.initialize());
  console.log('[Server.mjs] Passport initialized.');
  // ENTFERNT: Globale Passport-Session - wird nur für Auth-Routen benötigt
  // console.log('[Server.mjs] Initializing Passport session...');
  // app.use(passport.session());
  // console.log('[Server.mjs] Passport session initialized.');

  // Initialize Passport OIDC strategy
  // ... existing code ...

  // Optimierte Middleware-Stack

  // Logging nur für wichtige Requests
  app.use(morgan('combined', {
    skip: function (req, res) {
      return req.url.includes('/api/') && req.method === 'POST' || res.statusCode < 400;
    },
    stream: { write: message => {} }
  }));

  // Rate Limiting
  // app.use(redisRateLimiter);

  // Cache für statische Dateien - WICHTIG: Nach Session!
  app.use(cacheMiddleware);

  // === Health Check Endpoint ===
  // Simple health check endpoint for frontend server availability detection
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      worker: process.pid,
      uptime: process.uptime()
    });
  });

  // === Subdomain Handler for Sites ===
  // WICHTIG: Muss vor setupRoutes kommen!
  // TEMPORARILY DISABLED FOR DEBUGGING
  // const { subdomainHandler } = await import('./middleware/subdomainHandler.js');
  // app.use(subdomainHandler);
  // === Ende Subdomain Handler ===

  // === TUS Upload Handler ===
  // WICHTIG: Muss VOR setupRoutes und VOR den statischen Fallbacks stehen!
  const tusUploadPath = '/api/subtitler/upload'; // Pfad aus tusService.js
  app.all(tusUploadPath + '*', (req, res) => { // .all() für alle Methoden, '*' für Upload-IDs
    // Leite die Anfrage an den tusServer weiter
    // Der tusServer kümmert sich intern um die verschiedenen HTTP-Methoden (POST, HEAD, PATCH etc.)
    console.log(`[Server] Routing request for ${req.method} ${req.url} to tusServer`); // Logging hinzufügen
    tusServer.handle(req, res);
  });
  // === Ende TUS Upload Handler ===

  // Routen einrichten
  await setupRoutes(app);

  // Multer Konfiguration für Videouploads - NACH den Routen!
  const videoUpload = multer({
    limits: {
      fileSize: 150 * 1024 * 1024, // 150MB für Videos
    },
    fileFilter: (req, file, cb) => {
      // Erlaubte Video-Formate
      const allowedMimes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Ungültiges Dateiformat. Nur MP4, MOV und AVI sind erlaubt.'));
      }
    }
  });

  // Allgemeine Dateiupload-Konfiguration
  const generalUpload = multer({
    limits: {
      fileSize: 75 * 1024 * 1024 // 75MB für andere Dateien
    }
  });

  // Middleware für verschiedene Upload-Routen
  app.use('/subtitler/process', videoUpload.single('video'));
  app.use('/upload', generalUpload.single('file'));

  // Fehlerbehandlung für zu große Dateien
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'Datei ist zu groß. Videos dürfen maximal 150MB groß sein.'
        });
      }
    }
    next(error);
  });

  // Optimierte statische Datei-Auslieferung für Vite
  const staticFilesPath = path.join(__dirname, '../gruenerator_frontend/build');

  // Statische Assets mit spezifischer Struktur
  app.use('/assets', express.static(path.join(staticFilesPath, 'assets'), {
    maxAge: '1d',
    etag: true,
    immutable: true // Hash im Dateinamen erlaubt immutable caching
  }));

  // Andere statische Dateien im Root
  app.use(express.static(staticFilesPath, {
    maxAge: '1d',
    etag: true,
    // Nur echte Dateien servieren, keine Verzeichnisse
    index: false,
    // Explizite Dateiendungen für statische Dateien
    extensions: ['html', 'js', 'css', 'png', 'jpg', 'gif', 'svg', 'ico']
  }));

  // Handle subdomain public sites BEFORE SPA routing
  // TEMPORARILY DISABLED FOR DEBUGGING
  // const { default: publicSiteRouter } = await import('./routes/publicSite.mjs');
  // app.use((req, res, next) => {
  //   if (req.siteData) {
  //     return publicSiteRouter(req, res, next);
  //   }
  //   next();
  // });

  // SPA-Routing: Alle anderen Anfragen zu index.html
  app.get('*', (req, res, next) => {
    // API-Routen ignorieren
    if (req.path.startsWith('/api')) {
      return next(); // Ensure next() is called for API routes
    }

    const indexPath = path.join(staticFilesPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next(new Error('index.html nicht gefunden'));
    }
  });

  // Statisches Verzeichnis für Video-Uploads
  app.use('/uploads/exports', express.static(path.join(__dirname, 'uploads/exports'), {
    setHeaders: (res, path, stat) => {
      if (path.endsWith('.mov') || path.endsWith('.MOV')) {
        res.set('Content-Type', 'video/quicktime');
      } else if (path.endsWith('.mp4')) {
        res.set('Content-Type', 'video/mp4');
      }
      res.set('Accept-Ranges', 'bytes');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-cache');
    }
  }));

  // Statisches Verzeichnis für Sharepic-Hintergrundbilder
  app.use('/public', express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path, stat) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    }
  }));

  // Entfernt: Problematisches AI-Request Middleware das alle API-Anfragen abfängt

  // Timeout-Einstellungen für große Dateiübertragungen
  app.use((req, res, next) => {
    req.setTimeout(300000); // 5 Minuten
    res.setTimeout(300000);
    next();
  });

  // Füge einen Middleware vor der Catch-all Route hinzu, um 404-Fehler zu loggen
  app.use((req, res, next) => {
    // Nur für statische Dateianfragen
    next();
  });

  // Root und Catch-all Routes
  /* Commenting out these potentially problematic routes
  app.get('/', (req, res, next) => {
    try {
      const filePath = path.join(staticFilesPath, 'index.html');
      
      // Prüfe, ob die Datei existiert
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        throw new Error(`Index-Datei nicht gefunden: ${filePath}`);
      }
    } catch (err) {
      next(err); // Fehler an den Error Handler weiterleiten
    }
  });

  app.get('*', (req, res, next) => {
    try {
      const filePath = path.join(staticFilesPath, 'index.html');
      
      // Prüfe, ob die Datei existiert
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        throw new Error(`Index-Datei nicht gefunden: ${filePath}`);
      }
    } catch (err) {
      next(err); // Fehler an den Error Handler weiterleiten
    }
  });
  */

  // Error Handler 
  app.use((err, req, res, next) => {
    // Bestimme, ob wir in der Entwicklungsumgebung sind
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Prüfe auf spezifische Fehlertypen
    let errorMessage = 'Bitte versuchen Sie es später erneut';
    let statusCode = 500;
    
    // Handle authentication errors
    if (err.name === 'AuthenticationError' || err.message && err.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentifizierung fehlgeschlagen. Bitte melden Sie sich erneut an.';
      
      // For browser requests, redirect to login
      if (req.accepts('html') && !req.xhr) {
        return res.redirect('/auth/login');
      }
    } else if (err.message && err.message.includes('Index-Datei nicht gefunden')) {
      errorMessage = 'Die Anwendung konnte nicht geladen werden. Bitte kontaktieren Sie den Administrator.';
    } else if (err.code === 'ENOENT') {
      errorMessage = 'Eine benötigte Datei wurde nicht gefunden.';
    } else if (err.code === 'EACCES') {
      errorMessage = 'Zugriffsfehler beim Lesen einer Datei.';
    }
    
    // Sende eine strukturierte Fehlerantwort
    res.status(statusCode).json({
      success: false,
      error: 'Ein Serverfehler ist aufgetreten',
      message: isDevelopment ? err.message : errorMessage,
      // Nur in der Entwicklungsumgebung den Stack senden
      stack: isDevelopment ? err.stack : undefined,
      // Eine eindeutige Fehler-ID für die Fehlersuche
      errorId: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      // Zusätzliche Informationen für die Fehlersuche
      errorCode: err.code,
      errorType: err.name
    });
  });

  // Ändere die Server-Konfiguration
  const serverOptions = {
    // HTTP/2 Einstellungen
    enableHTTP2: true,
    allowHTTP1: true, // Fallback auf HTTP/1
    // PING Timeout erhöhen
    timeout: 5000,
    // Keep-Alive Einstellungen
    keepAliveTimeout: 60000,
    headersTimeout: 65000,
  };

  // Ersetze den Server-Start
  const server = http.createServer(serverOptions, app);

  // PING Intervall konfigurieren
  server.on('connection', (socket) => {
    socket.setKeepAlive(true, 30000); // 30 Sekunden
  });

  // DIAGNOSTIC LOGS FOR PORT
  console.log(`[DIAGNOSTIC] Worker ${process.pid}: process.env.PORT is: ${process.env.PORT}`);
  console.log(`[DIAGNOSTIC] Worker ${process.pid}: desiredPort is: ${desiredPort}`);
  console.log(`[DIAGNOSTIC] Worker ${process.pid}: host is: ${host}`);

  server.listen(desiredPort, host, () => {
    console.log(`Main Backend Worker ${process.pid} started - Server running at http://${host}:${desiredPort}`);
  });
}