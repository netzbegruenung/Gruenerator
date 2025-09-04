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
import { spawn } from 'child_process';

// Adjusted imports for CommonJS modules
import routesModule from './routes.js';
const { setupRoutes } = routesModule;

import AiWorkerPoolModule from './workers/aiWorkerPool.js';
const AIWorkerPool = AiWorkerPoolModule;

import tusServiceModule from './routes/subtitler/services/tusService.js';
const { tusServer } = tusServiceModule;

// Import session and auth modules at the top level
import session from 'express-session';
import {RedisStore} from 'connect-redis';
import passport from './config/passportSetup.mjs';

const require = createRequire(import.meta.url);

const numCPUs = os.cpus().length;

// Load environment variables
dotenv.config();

// ES-Module friendly __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Globaler Worker-Pool für AI-Anfragen
let aiWorkerPool;
let masterShutdownInProgress = false;
let yjsServerProcess;
let hocuspocusServerProcess;

// ... existing code ...

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Embedding server disabled permanently (Mistral embeddings are used instead)
  console.log('[Master] Embedding server not started (using Mistral embeddings).');

  // Start Y.js server only when explicitly enabled
  if (process.env.YJS_ENABLED === 'true') {
    console.log('[Master] Starting Y.js collaborative server...');
    yjsServerProcess = spawn('node', ['yjsServer.mjs'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: __dirname
    });

    yjsServerProcess.stdout.on('data', (data) => {
      console.log(`[YjsServer] ${data.toString().trim()}`);
    });

    yjsServerProcess.stderr.on('data', (data) => {
      console.error(`[YjsServer] ${data.toString().trim()}`);
    });

    yjsServerProcess.on('exit', (code, signal) => {
      if (!masterShutdownInProgress) {
        console.error(`[Master] Y.js server exited with code ${code}, signal ${signal}`);
        console.log('[Master] Restarting Y.js server...');
        // Restart Y.js server if it crashes
        yjsServerProcess = spawn('node', ['yjsServer.mjs'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: __dirname
        });
      }
    });
  } else {
    console.log('[Master] Y.js collaborative server not started (YJS_ENABLED!=true)');
  }

  // Start Hocuspocus server as child process (can be disabled with HOCUSPOCUS_ENABLED=false)
  if (process.env.HOCUSPOCUS_ENABLED === 'false') {
    console.log('[Master] Hocuspocus server disabled by HOCUSPOCUS_ENABLED=false');
  } else {
    console.log('[Master] Starting Hocuspocus collaborative server...');
    hocuspocusServerProcess = spawn('node', ['hocuspocusServer.mjs'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: __dirname,
    });

    hocuspocusServerProcess.stdout.on('data', (data) => {
      console.log(`[Hocuspocus] ${data.toString().trim()}`);
    });

    hocuspocusServerProcess.stderr.on('data', (data) => {
      console.error(`[Hocuspocus] ${data.toString().trim()}`);
    });

    hocuspocusServerProcess.on('exit', (code, signal) => {
      if (!masterShutdownInProgress) {
        console.error(`[Master] Hocuspocus server exited with code ${code}, signal ${signal}`);
        console.log('[Master] Restarting Hocuspocus server...');
        hocuspocusServerProcess = spawn('node', ['hocuspocusServer.mjs'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: __dirname,
        });
      }
    });
  }

  // Anzahl der Worker aus Umgebungsvariable lesen oder Standardwert verwenden
  const workerCount = parseInt(process.env.WORKER_COUNT, 10) || 1;
  console.log(`Starting ${workerCount} workers (WORKER_COUNT: ${workerCount})`);

  // Fork Workers
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Verbesserte Worker-Exit-Behandlung
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    // Nur neue Worker starten, wenn es kein geplanter Shutdown war
    if (!worker.exitedAfterDisconnect && !masterShutdownInProgress) {
      console.log('Starting new worker...');
      cluster.fork();
    }
  });

  // Koordinierte Shutdown-Sequenz für den Master
  const masterShutdown = async (signal) => {
    if (masterShutdownInProgress) {
      console.log(`Master shutdown already in progress, ignoring ${signal}`);
      return;
    }
    masterShutdownInProgress = true;
    
    console.log(`Master received ${signal}, initiating graceful shutdown...`);
    
    // Disconnect alle Worker (verhindert neue Worker bei Exit)
    const workers = Object.values(cluster.workers);
    workers.forEach(worker => {
      worker.disconnect();
    });
    
    // Benachrichtige alle Worker über den bevorstehenden Shutdown
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

    // No embedding server to shutdown

    // Shutdown Y.js server
    if (yjsServerProcess) {
      console.log('Shutting down Y.js server...');
      yjsServerProcess.kill('SIGTERM');
      
      // Wait for Y.js server to exit or force kill after timeout
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('Y.js server shutdown timeout, forcing kill');
          yjsServerProcess.kill('SIGKILL');
          resolve();
        }, 5000);
        
        yjsServerProcess.on('exit', () => {
          clearTimeout(timeout);
          console.log('Y.js server shut down successfully');
          resolve();
        });
      });
    }

    // Shutdown Hocuspocus server
    if (hocuspocusServerProcess) {
      console.log('Shutting down Hocuspocus server...');
      hocuspocusServerProcess.kill('SIGTERM');

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('Hocuspocus server shutdown timeout, forcing kill');
          hocuspocusServerProcess.kill('SIGKILL');
          resolve();
        }, 5000);

        hocuspocusServerProcess.on('exit', () => {
          clearTimeout(timeout);
          console.log('Hocuspocus server shut down successfully');
          resolve();
        });
      });
    }

    console.log('All workers and services shut down successfully');
    process.exit(0);
  };

  process.on('SIGTERM', () => masterShutdown('SIGTERM'));
  process.on('SIGINT', () => masterShutdown('SIGINT'));
} else {

  const app = express();
  let workerShutdownInProgress = false;
  // Mark readiness early; we'll flip to true after routes are mounted
  app.locals.ready = false;

  // Add global error handlers to catch crashes during initialization
  process.on('uncaughtException', (error) => {
    console.error(`[Worker ${process.pid}] UNCAUGHT EXCEPTION:`, error);
    console.error(`[Worker ${process.pid}] Stack:`, error.stack);
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(`[Worker ${process.pid}] UNHANDLED PROMISE REJECTION at:`, promise);
    console.error(`[Worker ${process.pid}] Reason:`, reason);
    setTimeout(() => process.exit(1), 1000);
  });

  // Port/host configuration (listen early to avoid upstream 502s during heavy init)
  const desiredPort = process.env.PORT || 3001;
  const host = process.env.HOST || "0.0.0.0";

  // Minimal health endpoint available immediately
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'starting',
      ready: app.locals.ready === true,
      timestamp: new Date().toISOString(),
      worker: process.pid,
      uptime: process.uptime()
    });
  });

  // Serve minimal static frontend during warmup to avoid "Cannot GET /"
  const staticFilesPathEarly = path.join(__dirname, '../gruenerator_frontend/build');
  // Early assets (optional but helps first paint)
  app.use('/assets', express.static(path.join(staticFilesPathEarly, 'assets'), {
    maxAge: '1h',
    etag: true,
  }));
  // Early SPA index fallback only while not ready
  app.get('*', (req, res, next) => {
    if (app.locals.ready === true) return next();
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(staticFilesPathEarly, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return next();
  });

  // HTTP server config and early start
  const serverOptions = {
    enableHTTP2: true,
    allowHTTP1: true,
    timeout: 5000,
    keepAliveTimeout: 60000,
    headersTimeout: 65000,
  };
  const server = http.createServer(serverOptions, app);
  server.on('connection', (socket) => {
    socket.setKeepAlive(true, 30000);
  });
  console.log(`[DIAGNOSTIC] Worker ${process.pid}: process.env.PORT is: ${process.env.PORT}`);
  console.log(`[DIAGNOSTIC] Worker ${process.pid}: desiredPort is: ${desiredPort}`);
  console.log(`[DIAGNOSTIC] Worker ${process.pid}: host is: ${host}`);
  
  // Start listening immediately to keep process alive during initialization
  server.listen(desiredPort, host, () => {
    console.log(`Main Backend Worker ${process.pid} started - Server listening at http://${host}:${desiredPort}`);
    console.log(`[Worker ${process.pid}] Server accepting connections, continuing with app initialization...`);
  });
  
  // Import Redis client only in worker process
  const redisClient = require('./utils/redisClient.js');
  
  // Redis Client is already configured and connected in utils/redisClient.js
  // No need to create a new client here

  // CORS Setup - MUSS GANZ AM ANFANG kommen!
  const allowedOrigins = [
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
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://www.gruenerator-test.netzbegruenung.verdigado.net',
    'https://www.gruenerator-test.de',
    'https://www.gruenerator.de',
    'https://www.gruenerator.netzbegruenung.verdigado.net',
    'https://www.xn--grnerator-z2a.xn--netzbegrnung-dfb.verdigado.net',
    'https://www.xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net',
    'http://gruenerator.de',
  ];

  const corsOptions = {
    origin: function (origin, callback) {
      if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
      } else {
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

  // CORS muss ZUERST kommen!
  app.use(cors(corsOptions));
  
  // Setze Express Limit
  app.use(express.json({limit: '500mb'}));
  app.use(express.raw({limit: '500mb'}));
  app.use(bodyParser.json({ limit: '105mb' }));
  app.use(bodyParser.urlencoded({ limit: '105mb', extended: true }));
  
  // Timeout-Einstellungen
  app.use((req, res, next) => {
    res.setTimeout(900000); // 15 Minuten
    next();
  });

  // Worker-Pool für AI-Anfragen initialisieren
  const aiWorkerCount = parseInt(process.env.AI_WORKER_COUNT, 10) || 1;
  console.log(`Initializing AI worker pool with ${aiWorkerCount} workers (with Redis support for privacy mode)`);
  aiWorkerPool = new AIWorkerPool(aiWorkerCount, redisClient);
  app.locals.aiWorkerPool = aiWorkerPool;

  // Initialize AI Search Agent with worker pool
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const aiSearchAgent = require('./services/aiSearchAgent.js');
    aiSearchAgent.setAIWorkerPool(aiWorkerPool);
    console.log('AI Search Agent initialized with worker pool');
  } catch (error) {
    console.error('Warning: Could not initialize AI Search Agent:', error.message);
  }

  // Initialize ProfileService and PostgreSQL database
  try {
    const { getProfileService } = await import('./services/ProfileService.js');
    const profileService = getProfileService();
    await profileService.init();
    console.log('ProfileService initialized successfully with PostgreSQL');
  } catch (error) {
    console.error('Warning: Could not initialize ProfileService:', error.message);
  }

  // Compression Middleware
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6 // Optimaler Kompromiss zwischen CPU und Kompression
  }));

  // Security Helmet
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

  // desiredPort/host already defined above for early server start

  // Multer Konfiguration für Videouploads - MOVED AFTER ROUTES
  // Die Multer-Middleware wird nach setupRoutes verschoben

  // Verbesserte Graceful Shutdown Handler für Worker
  process.on('message', async (msg) => {
    if (msg.type === 'shutdown' && !workerShutdownInProgress) {
      workerShutdownInProgress = true;
      console.log(`Worker ${process.pid} received shutdown signal`);
      
      try {
        // Beende AI Worker Pool
        if (aiWorkerPool) {
          console.log('Shutting down AI worker pool...');
          await aiWorkerPool.shutdown();
        }

        // Schließe Redis-Verbindung nur wenn sie offen ist
        if (redisClient && redisClient.isOpen) {
          console.log('Closing Redis connection...');
          await redisClient.quit();
        }

        // Schließe den Server
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

  // Fallback für direkte Signal-Behandlung
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

  // Redis-Cache für statische Dateien (EXCLUDE API ROUTES) - BUGFIX!
  const cacheMiddleware = async (req, res, next) => {
    // WICHTIG: API-Routen NIEMALS cachen!
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }
    
    const key = `cache:${req.originalUrl}`;
    try {
      const cachedResponse = await redisClient.get(key);
      if (cachedResponse) {
        return res.send(JSON.parse(cachedResponse));
      }
      
      // Nur für NICHT-API-Routen cachen
      const originalSend = res.send;
      res.send = function(body) {
        // Nur cachen wenn es keine API-Route ist
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
  
  app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || 'fallback-secret-please-change',
    resave: false,
    saveUninitialized: false,
    name: 'gruenerator.sid', // Custom session name to avoid conflicts
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // Allow cross-port in development
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

  // Update health endpoint to reflect readiness once initialization completes
  // (route defined above for immediate availability)

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
  console.log(`[Worker ${process.pid}] About to start route setup...`);
  try {
    console.log(`[Worker ${process.pid}] Setting up routes...`);
    await setupRoutes(app);
    console.log(`[Worker ${process.pid}] Routes setup completed successfully`);
    app.locals.ready = true;
  } catch (error) {
    console.error(`[Worker ${process.pid}] CRITICAL ERROR: Failed to setup routes:`);
    console.error(`[Worker ${process.pid}] Error message:`, error?.message || 'Unknown error');
    console.error(`[Worker ${process.pid}] Error name:`, error?.name || 'Unknown');
    console.error(`[Worker ${process.pid}] Full error object:`, error);
    if (error?.stack) {
      console.error(`[Worker ${process.pid}] Stack trace:`, error.stack);
    }
    
    // Don't mark as ready if routes failed to setup
    app.locals.ready = false;
    
    // Exit the worker process since routes are essential
    console.error(`[Worker ${process.pid}] Exiting due to route setup failure`);
    setTimeout(() => process.exit(1), 1000); // Delay to ensure logs are written
  }

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
    
    // Handle database errors
    if (err.message && (err.message.includes('Database service unavailable') || 
                       err.message.includes('PostgresService failed to initialize') ||
                       err.message.includes('Database connection'))) {
      statusCode = 503; // Service Unavailable
      errorMessage = 'Der Datenbankdienst ist momentan nicht verfügbar. Bitte versuchen Sie es in wenigen Minuten erneut.';
    // Handle authentication errors
    } else if (err.name === 'AuthenticationError' || err.message && err.message.includes('authentication')) {
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
      error: statusCode === 503 ? 'Datenbankdienst nicht verfügbar' : 'Ein Serverfehler ist aufgetreten',
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

  // Server already started above to keep process alive during initialization
  console.log(`[Worker ${process.pid}] Application initialization complete - server is already listening`);
}
