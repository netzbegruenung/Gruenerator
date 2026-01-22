/**
 * Server Entry Point
 * Main Express server with cluster support and graceful shutdown
 */

// Load environment variables FIRST before any other imports
import 'dotenv/config';

import express, { Express, Request, Response, NextFunction } from 'express';
import cluster from 'cluster';
import os from 'os';
import compression from 'compression';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import multer from 'multer';
import session from 'express-session';
import { RedisStore } from 'connect-redis';

// Local imports
import { createLogger } from './utils/logger.js';
import { getCorsOrigins, PRIMARY_DOMAIN } from './utils/domainUtils.js';
import { createCorsOptions } from './config/cors.js';
import { getServerConfig } from './config/serverConfig.js';
import { createCacheMiddleware } from './middleware/cacheMiddleware.js';
import { shouldSkipBodyParser, TUS_UPLOAD_PATHS } from './middleware/bodyParserConfig.js';
import { createMasterShutdownHandler, createWorkerShutdownHandler } from './utils/shutdown/index.js';
import passport from './config/passportSetup.js';
import { setupRoutes } from './routes.js';
import AIWorkerPool from './workers/aiWorkerPool.js';
import redisClient, { ensureConnected, checkRedisHealth } from './utils/redis/client.js';
import { tusServer } from './services/subtitler/tusService.js';
import { startCleanupScheduler as startExportCleanup } from './services/subtitler/exportCleanupService.js';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('Server');
const numCPUs = os.cpus().length;

let aiWorkerPool: AIWorkerPool | null = null;

if (cluster.isPrimary) {
  // Master process - fork workers
  const workerCount = parseInt(process.env.WORKER_COUNT || '2', 10);
  log.info(`Master ${process.pid} starting ${workerCount} workers`);

  // Attach error handler to each worker when forked
  cluster.on('fork', (worker) => {
    worker.on('error', (error) => {
      // Handle IPC disconnection errors gracefully
      if ((error as NodeJS.ErrnoException).code === 'ERR_IPC_DISCONNECTED') {
        log.debug(`Worker ${worker.process.pid} IPC disconnected (expected during shutdown)`);
      } else {
        log.warn(`Worker ${worker.process.pid} error: ${error.message}`);
      }
    });
  });

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Start Hocuspocus WebSocket server if enabled
  let hocuspocusProcess: ReturnType<typeof spawn> | null = null;
  let isShuttingDown = false;

  const killHocuspocus = () => {
    if (hocuspocusProcess && !hocuspocusProcess.killed) {
      log.info('Killing Hocuspocus process...');
      hocuspocusProcess.kill('SIGTERM');
      // Force kill after 3 seconds if still alive
      setTimeout(() => {
        if (hocuspocusProcess && !hocuspocusProcess.killed) {
          log.warn('Force killing Hocuspocus process...');
          hocuspocusProcess.kill('SIGKILL');
        }
      }, 3000);
    }
  };

  // Ensure Hocuspocus is killed when master process exits
  process.on('exit', killHocuspocus);
  process.on('beforeExit', killHocuspocus);

  if (process.env.HOCUSPOCUS_ENABLED === 'true') {
    log.info('Starting Hocuspocus WebSocket server...');
    hocuspocusProcess = spawn('npx', ['tsx', 'services/hocuspocus/hocuspocusServer.ts'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: process.env,
      detached: false // Ensure child process is attached to parent
    });

    hocuspocusProcess.on('error', (error: Error) => {
      log.error(`Hocuspocus server error: ${error.message}`);
    });

    hocuspocusProcess.on('exit', (code: number | null, signal: string | null) => {
      log.warn(`Hocuspocus server exited (code: ${code}, signal: ${signal})`);
      if (!isShuttingDown && code !== 0 && code !== null) {
        log.error('Hocuspocus server crashed, restarting in 2s...');
        setTimeout(() => {
          if (!isShuttingDown && process.env.HOCUSPOCUS_ENABLED === 'true') {
            hocuspocusProcess = spawn('npx', ['tsx', 'services/hocuspocus/hocuspocusServer.ts'], {
              cwd: __dirname,
              stdio: 'inherit',
              env: process.env,
              detached: false
            });
          }
        }, 2000);
      }
    });
  }

  // Start export cleanup scheduler (runs in master process only)
  startExportCleanup();

  const { shutdown, registerSignalHandlers } = createMasterShutdownHandler({
    workerTimeout: 10000,
    logger: log,
    onComplete: () => {
      isShuttingDown = true;
      killHocuspocus();
    }
  });

  cluster.on('exit', (worker, code, signal) => {
    log.warn(`Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`);
    if (!worker.exitedAfterDisconnect && !isShuttingDown) {
      log.info('Starting replacement worker');
      cluster.fork();
    }
  });

  registerSignalHandlers();
} else {
  // Worker process - run Express server
  await startWorker();
}

async function startWorker(): Promise<void> {
  const app: Express = express();
  const config = getServerConfig();
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // CORS configuration
  const allowedOrigins = getCorsOrigins(isDevelopment);
  const corsOptions = createCorsOptions(allowedOrigins);
  app.use(cors(corsOptions));

  // Body parsing with TUS skip logic
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipBodyParser(req)) {
      return next();
    }
    express.json({ limit: '10mb' })(req, res, next);
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipBodyParser(req)) {
      return next();
    }
    express.urlencoded({ limit: '10mb', extended: true })(req, res, next);
  });

  // Response timeout
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(config.responseTimeout);
    next();
  });

  // Initialize AI worker pool
  const aiWorkerCount = parseInt(process.env.AI_WORKER_COUNT || '7', 10);
  log.debug(`Initializing AI worker pool with ${aiWorkerCount} workers`);
  aiWorkerPool = new AIWorkerPool(aiWorkerCount, redisClient as any);
  app.locals.aiWorkerPool = aiWorkerPool;

  // Initialize AI Search Agent
  try {
    const aiSearchAgentModule = await import('./services/aiSearchAgent.js') as any;
    if (typeof aiSearchAgentModule.setAIWorkerPool === 'function') {
      aiSearchAgentModule.setAIWorkerPool(aiWorkerPool);
      log.debug('AI Search Agent initialized');
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn(`AI Search Agent init failed: ${err.message}`);
  }

  // Initialize Plan Mode Worker Pool
  try {
    const planModeModule = await import('./routes/plan-mode/index.js') as any;
    if (typeof planModeModule.setPlanModeWorkerPool === 'function') {
      planModeModule.setPlanModeWorkerPool(aiWorkerPool);
      log.debug('Plan Mode Worker Pool initialized');
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn(`Plan Mode Worker Pool init failed: ${err.message}`);
  }

  // Initialize Temporary Image Storage
  try {
    const { default: TemporaryImageStorage } = await import('./services/image/TemporaryImageStorage.js');
    const temporaryImageStorage = new TemporaryImageStorage(redisClient as any);
    app.locals.sharepicImageManager = temporaryImageStorage;
    log.debug('TemporaryImageStorage initialized');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn(`TemporaryImageStorage init failed: ${err.message}`);
  }

  // Initialize PostgreSQL
  try {
    const { getPostgresInstance } = await import('./database/services/PostgresService.js');
    const postgresService = getPostgresInstance();
    await postgresService.init();
    log.info('PostgreSQL connected and schema synchronized');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error(`PostgreSQL initialization failed: ${err.message}`);
  }

  // Initialize Profile Service
  try {
    const { getProfileService } = await import('./services/user/ProfileService.js');
    const profileService = getProfileService();
    await profileService.init();
    log.debug('ProfileService initialized');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn(`ProfileService init failed: ${err.message}`);
  }

  // Compression middleware
  app.use(compression({
    filter: (req: Request, res: Response) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6
  }));

  // Security middleware (Helmet)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:", "https://analytics.gruenes-cms.de"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.unsplash.com", "https://*.canva.com", "https://static.canva.com", "https://analytics.gruenes-cms.de"],
        connectSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.supabase.co",
          "https://analytics.gruenes-cms.de",
          `http://*.${PRIMARY_DOMAIN}`,
          `https://*.${PRIMARY_DOMAIN}`,
          "http://*.gruenerator.de",
          "https://*.gruenerator.de",
          "http://*.gruenerator.at",
          "https://*.gruenerator.at",
          "http://*.gruenerator.eu",
          "https://*.gruenerator.eu",
          "http://*.xn--grnerator-z2a.de",
          "https://*.xn--grnerator-z2a.de",
          "http://localhost:*",
          "http://127.0.0.1:*",
          "http://*.netzbegruenung.verdigado.net",
          "https://*.netzbegruenung.verdigado.net",
          ...allowedOrigins,
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: [
          "'self'",
          "https://www.instagram.com",
          "https://instagram.com",
        ],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  }));

  // Ensure Redis is connected before session middleware
  try {
    await ensureConnected();
    log.info('Redis connected');
  } catch (err) {
    log.error('Redis connection failed, sessions may not persist');
  }

  // Session configuration
  const sessionSecret = process.env.SESSION_SECRET || 'temporary-fallback-secret-for-mobile-only';
  if (!process.env.SESSION_SECRET) {
    log.warn('SESSION_SECRET not set - using temporary fallback');
  }

  app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    name: 'gruenerator.sid',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax',
      domain: undefined,
      path: '/'
    }
  }));

  // Passport middleware
  app.use(passport.initialize());

  // Logging middleware (only for errors)
  app.use(morgan('combined', {
    skip: function (req: Request, res: Response) {
      return (req.url.includes('/api/') && req.method === 'POST') || res.statusCode < 400;
    },
    stream: { write: (message: string) => {} }
  }));

  // Cache middleware
  const cacheMiddleware = createCacheMiddleware(redisClient as any, {
    ttl: 3600,
    excludePaths: ['/api/']
  });
  app.use(cacheMiddleware);

  // Health check endpoint
  app.get('/health', async (req: Request, res: Response) => {
    const redisHealth = await checkRedisHealth();

    res.status(redisHealth.connected ? 200 : 503).json({
      status: redisHealth.connected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      worker: process.pid,
      uptime: process.uptime(),
      services: {
        redis: redisHealth
      }
    });
  });

  // TUS Upload Handler (must be before setupRoutes)
  const tusUploadPath = '/api/subtitler/upload';
  app.all(tusUploadPath, (req: Request, res: Response) => {
    tusServer.handle(req, res);
  });
  app.all(tusUploadPath + '/*splat', (req: Request, res: Response) => {
    tusServer.handle(req, res);
  });

  // Setup API routes
  await setupRoutes(app);

  // Multer configuration for video uploads
  const videoUpload = multer({
    limits: {
      fileSize: 150 * 1024 * 1024, // 150MB for videos
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Ungültiges Dateiformat. Nur MP4, MOV und AVI sind erlaubt.'));
      }
    }
  });

  // General file upload configuration
  const generalUpload = multer({
    limits: {
      fileSize: 75 * 1024 * 1024 // 75MB
    }
  });

  // Upload middleware for specific routes
  app.use('/subtitler/process', videoUpload.single('video'));
  app.use('/upload', generalUpload.single('file'));

  // Multer error handling
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'Datei ist zu groß. Videos dürfen maximal 150MB groß sein.'
        });
        return;
      }
    }
    next(error);
  });

  // Static files
  const staticFilesPath = path.join(__dirname, '../web/build');

  app.use('/assets', express.static(path.join(staticFilesPath, 'assets'), {
    maxAge: '1d',
    etag: true,
    immutable: true,
    dotfiles: 'deny'
  }));

  app.use(express.static(staticFilesPath, {
    maxAge: '1d',
    etag: true,
    index: false,
    extensions: ['html', 'js', 'css', 'png', 'jpg', 'gif', 'svg', 'ico'],
    dotfiles: 'deny'
  }));

  // SPA routing
  app.get('{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }

    const indexPath = path.join(staticFilesPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next(new Error('index.html nicht gefunden'));
    }
  });

  // Static directory for video exports
  app.use('/uploads/exports', express.static(path.join(__dirname, 'uploads/exports'), {
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mov') || filePath.endsWith('.MOV')) {
        res.set('Content-Type', 'video/quicktime');
      } else if (filePath.endsWith('.mp4')) {
        res.set('Content-Type', 'video/mp4');
      }
      res.set('Accept-Ranges', 'bytes');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-cache');
    }
  }));

  // Static directory for sharepic backgrounds
  app.use('/backend-static', express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }));

  // Request timeout
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(config.requestTimeout);
    res.setTimeout(config.requestTimeout);
    next();
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    const isDev = process.env.NODE_ENV === 'development';
    let errorMessage = 'Bitte versuchen Sie es später erneut';
    let statusCode = 500;

    if (err.name === 'AuthenticationError' || (err.message && err.message.includes('authentication'))) {
      statusCode = 401;
      errorMessage = 'Authentifizierung fehlgeschlagen. Bitte melden Sie sich erneut an.';

      if (req.accepts('html') && !(req as any).xhr) {
        res.redirect('/auth/login');
        return;
      }
    } else if (err.message && err.message.includes('Index-Datei nicht gefunden')) {
      errorMessage = 'Die Anwendung konnte nicht geladen werden. Bitte kontaktieren Sie den Administrator.';
    } else if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      errorMessage = 'Eine benötigte Datei wurde nicht gefunden.';
    } else if ((err as NodeJS.ErrnoException).code === 'EACCES') {
      errorMessage = 'Zugriffsfehler beim Lesen einer Datei.';
    }

    res.status(statusCode).json({
      success: false,
      error: 'Ein Serverfehler ist aufgetreten',
      message: isDev ? err.message : errorMessage,
      stack: isDev ? err.stack : undefined,
      errorId: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      errorCode: (err as NodeJS.ErrnoException).code,
      errorType: err.name
    });
  });

  // Create HTTP server
  const server = http.createServer(config.httpOptions, app);

  // Socket keep-alive configuration
  server.on('connection', (socket) => {
    socket.setKeepAlive(true, config.socketKeepAliveInterval);
  });

  // Worker shutdown handler
  const shutdownHandler = createWorkerShutdownHandler({
    resources: [
      aiWorkerPool as any,
      redisClient as any
    ].filter(Boolean),
    server,
    logger: log
  });
  shutdownHandler.registerSignalHandlers();

  // Start server
  server.listen(config.port, config.host, () => {
    log.info(`Worker ${process.pid} listening on http://${config.host}:${config.port}`);
  });
}
