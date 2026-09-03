/**
 * Server Entry Point
 * Main Express server with cluster support and graceful shutdown
 */

// Load environment variables FIRST before any other imports
import 'dotenv/config';
import { spawn } from 'child_process';
import cluster from 'cluster';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import compression from 'compression';
import cors from 'cors';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { isHttpError } from 'http-errors';
import morgan from 'morgan';
import multer from 'multer';

import { createCorsOptions } from './config/cors.js';
import { env } from './config/env.js';
import { CURRENT_INSTANCE } from './config/instance.js';
import { getServerConfig } from './config/serverConfig.js';
import { Sentry } from './lib/sentry.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { shouldSkipBodyParser } from './middleware/bodyParserConfig.js';
import { createCacheMiddleware } from './middleware/cacheMiddleware.js';
import { setupRoutes } from './routes.js';
import {
  startModelLatencyCleanup,
  startModelLatencyRollup,
} from './services/ai/modelLatencyStore.js';
import { startBoardAgentWorker } from './services/boards/boardAgentWorker.js';
import { startBoardScheduleWorker } from './services/boards/boardScheduleWorker.js';
import { startCardDueReminderWorker } from './services/boards/cardDueReminderWorker.js';
import { startNotebookLinkCleanup } from './services/cleanup/notebookLinkCleanupService.js';
import { startUploadsCleanup } from './services/cleanup/uploadsCleanupService.js';
import { startDocumentIngestWorker } from './services/document-services/DocumentProcessingService/documentIngestWorker.js';
import { startNotificationCleanup } from './services/notifications/notificationCleanupService.js';
import { startRecurringTaskWorker } from './services/recurringTasks/recurringTaskWorker.js';
import { startDeepResearchCleanup } from './services/research/deepAgent/resumableRuns.js';
import { startCleanupScheduler as startExportCleanup } from './services/subtitler/exportCleanupService.js';
import { tusServer, handleBinaryUpload } from './services/subtitler/tusService.js';
import { shutdownLangfuseTelemetry } from './services/telemetry/langfuseTelemetry.js';
import { getCorsOrigins, PRIMARY_DOMAIN } from './utils/domainUtils.js';
import { createLogger } from './utils/logger.js';
import redisClient, { ensureConnected, checkRedisHealth } from './utils/redis/client.js';
import {
  createMasterShutdownHandler,
  createWorkerShutdownHandler,
} from './utils/shutdown/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('Server');
const _numCPUs = os.cpus().length;

const isDev = env.NODE_ENV !== 'production';
const workerCount = env.WORKER_COUNT;
const skipCluster = isDev || workerCount <= 0;

if (skipCluster) {
  // Dev mode or WORKER_COUNT=0: run directly without clustering (tsx can't fork workers)
  log.info(`Running in single-process mode (pid: ${process.pid})`);

  // Start Hocuspocus if enabled
  if (env.HOCUSPOCUS_ENABLED) {
    log.info('Starting Hocuspocus WebSocket server...');
    const hocuspocusArgs = ['tsx', path.join(__dirname, '../../services/hocuspocus/src/index.ts')];
    const hocuspocusProcess = spawn('npx', hocuspocusArgs, {
      stdio: 'inherit',
      env: process.env,
      detached: false,
    });
    hocuspocusProcess.on('error', (error: Error) => {
      log.error(`Hocuspocus server error: ${error.message}`);
    });
    process.on('exit', () => {
      if (!hocuspocusProcess.killed) hocuspocusProcess.kill('SIGTERM');
    });
  }

  // Start cleanup schedulers
  startExportCleanup();
  startUploadsCleanup();
  startNotebookLinkCleanup();
  startNotificationCleanup();
  startDeepResearchCleanup();
  startModelLatencyCleanup();

  await startWorker();
} else if (cluster.isPrimary) {
  // Production master process - fork workers
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

  if (env.HOCUSPOCUS_ENABLED) {
    log.info('Starting Hocuspocus WebSocket server...');
    const hocuspocusCmd = 'npx';
    const hocuspocusArgs = ['tsx', path.join(__dirname, '../../services/hocuspocus/src/index.ts')];

    hocuspocusProcess = spawn(hocuspocusCmd, hocuspocusArgs, {
      stdio: 'inherit',
      env: process.env,
      detached: false,
    });

    hocuspocusProcess.on('error', (error: Error) => {
      log.error(`Hocuspocus server error: ${error.message}`);
    });

    hocuspocusProcess.on('exit', (code: number | null, signal: string | null) => {
      log.warn(`Hocuspocus server exited (code: ${code}, signal: ${signal})`);
      if (!isShuttingDown && code !== 0 && code !== null) {
        log.error('Hocuspocus server crashed, restarting in 2s...');
        setTimeout(() => {
          if (!isShuttingDown && env.HOCUSPOCUS_ENABLED) {
            hocuspocusProcess = spawn(hocuspocusCmd, hocuspocusArgs, {
              stdio: 'inherit',
              env: process.env,
              detached: false,
            });
          }
        }, 2000);
      }
    });
  }

  // Start cleanup schedulers (runs in master process only)
  startExportCleanup();
  startUploadsCleanup();
  startNotebookLinkCleanup();
  startNotificationCleanup();
  startDeepResearchCleanup();
  startModelLatencyCleanup();

  const { shutdown: _shutdown, registerSignalHandlers } = createMasterShutdownHandler({
    workerTimeout: 10000,
    logger: log,
    onComplete: () => {
      isShuttingDown = true;
      killHocuspocus();
    },
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
  const isDevelopment = env.NODE_ENV !== 'production';

  // Trust proxy for secure cookies behind nginx/load balancer
  app.set('trust proxy', 1);

  // CORS configuration
  const allowedOrigins = getCorsOrigins(isDevelopment);
  const corsOptions = createCorsOptions(allowedOrigins);
  const strictCors = cors(corsOptions);
  // The Bearer-authenticated MCP endpoint is origin-agnostic: browser MCP
  // clients send Origins outside the allowlist and must still reach the
  // 401/WWW-Authenticate challenge instead of dying in the strict validator.
  // Mcp-Session-Id is not exposed: we run stateless and never issue one, and
  // spec 2026-07-28 removes the header outright.
  const mcpCors = cors({ origin: true, exposedHeaders: ['WWW-Authenticate'] });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/mcp-server')) {
      mcpCors(req, res, next);
      return;
    }
    strictCors(req, res, next);
  });

  // Body parsing with TUS skip logic
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipBodyParser(req)) {
      return next();
    }
    express.json({ limit: '50mb' })(req, res, next);
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipBodyParser(req)) {
      return next();
    }
    express.urlencoded({ limit: '50mb', extended: true })(req, res, next);
  });

  // Response timeout
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(config.responseTimeout);
    next();
  });

  // Initialize Temporary Image Storage
  try {
    const { default: TemporaryImageStorage } =
      await import('./services/image/TemporaryImageStorage.js');
    const temporaryImageStorage = new TemporaryImageStorage(redisClient);
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

  // Misst mit, wie schnell jedes Modell antwortet, und wärmt die Basislinie aus
  // den letzten 24 h vor. Braucht die Postgres-Init oben.
  startModelLatencyRollup();

  // Async board agent: drains the agent_tasks queue (@gruenerator delegations).
  // Safe to run in every cluster worker — claiming uses FOR UPDATE SKIP LOCKED.
  startBoardAgentWorker();

  // Reminds card watchers about cards due today/tomorrow (idempotent via reminded_at).
  startCardDueReminderWorker();

  // Fires due board schedules (recurring KI-Spalte runs) → enqueues agent tasks.
  // Cluster-safe: the claim advances next_run_at under FOR UPDATE SKIP LOCKED.
  startBoardScheduleWorker();

  // EXPERIMENTAL: fires due standalone recurring tasks (recurring_tasks) → runs the
  // agent + delivers inline. Same cluster-safe claim pattern.
  startRecurringTaskWorker();

  // Turns uploaded documents into vectors. Same cluster-safe claim; also
  // reclaims rows whose processing died with a previous process, which used to
  // strand them on 'processing' forever.
  startDocumentIngestWorker();

  // TUS Upload Handler — registered before compression middleware.
  // TUS uploads are binary streams that don't benefit from compression
  // and authenticate via upload ID.
  const tusUploadPath = '/api/subtitler/upload';
  app.all(tusUploadPath, (req: Request, res: Response) => {
    void tusServer.handle(req, res);
  });
  app.all(tusUploadPath + '/*splat', (req: Request, res: Response) => {
    void tusServer.handle(req, res);
  });

  // Plain binary upload for non-TUS clients (mobile uses expo-file-system's
  // native uploader). Registered here — before compression and the body
  // parsers — so `req` stays the raw byte stream and writes straight to disk.
  // IP-rate-limited: the handler writes the request body straight to disk, so cap
  // upload attempts per window as defense against abuse.
  const uploadBinaryLimiter =
    process.env.DISABLE_RATE_LIMITS === 'true'
      ? (_req: Request, _res: Response, next: NextFunction) => next()
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 60,
          standardHeaders: true,
          legacyHeaders: false,
          message: { error: 'Zu viele Uploads. Bitte versuche es später erneut.' },
        });
  app.post('/api/subtitler/upload-binary', uploadBinaryLimiter, (req: Request, res: Response) => {
    void handleBinaryUpload(req, res);
  });

  // Audio uploads for the Transkription feature. Unlike the subtitler TUS path
  // above, this one is behind requireAuth: its only client is a logged-in page,
  // and an open endpoint that writes up to 500 MB per upload straight to disk is
  // a standing invitation. requireAuth reads req.headers only (cookie or bearer),
  // so it works here even though the body parsers run later; the CORS middleware
  // registered further up already answers OPTIONS preflights itself, so TUS's
  // non-POST verbs are not blocked by it.
  const audioUploadPath = '/api/audio/upload';
  app.all(audioUploadPath, uploadBinaryLimiter, requireAuth, (req: Request, res: Response) => {
    void tusServer.handle(req, res);
  });
  app.all(
    audioUploadPath + '/*splat',
    uploadBinaryLimiter,
    requireAuth,
    (req: Request, res: Response) => {
      void tusServer.handle(req, res);
    }
  );

  // Compression middleware
  app.use(
    compression({
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6,
    })
  );

  // Security middleware (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'data:',
            'https://umami-f0s4w04kg4oww8cg44ssg4w8.moritz-waechter.de',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://*.unsplash.com',
            'https://umami-f0s4w04kg4oww8cg44ssg4w8.moritz-waechter.de',
          ],
          connectSrc: [
            "'self'",
            'data:',
            'blob:',

            'https://umami-f0s4w04kg4oww8cg44ssg4w8.moritz-waechter.de',
            `http://*.${PRIMARY_DOMAIN}`,
            `https://*.${PRIMARY_DOMAIN}`,
            'http://*.gruenerator.de',
            'https://*.gruenerator.de',
            'http://*.gruenerator.at',
            'https://*.gruenerator.at',
            'http://*.gruenerator.eu',
            'https://*.gruenerator.eu',
            'http://*.xn--grnerator-z2a.de',
            'https://*.xn--grnerator-z2a.de',
            'http://localhost:*',
            'http://127.0.0.1:*',
            'http://*.netzbegruenung.verdigado.net',
            'https://*.netzbegruenung.verdigado.net',
            'https://app.glitchtip.com',
            ...allowedOrigins,
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", 'blob:'],
          frameSrc: ["'self'", 'https://www.instagram.com', 'https://instagram.com'],
          reportUri: [
            'https://app.glitchtip.com/api/19466/security/?glitchtip_key=3bfeac13e8e14018a06d8f7f770f46ca',
          ],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  // Ensure Redis is connected before session middleware
  try {
    await ensureConnected();
    log.info('Redis connected');
  } catch (_err) {
    log.error('Redis connection failed, sessions may not persist');
  }

  // Better Auth handler (must be before express.json middleware)
  // Better Auth has its own Redis-backed rate limits for business logic, but we
  // also add an IP-based limiter here as defense-in-depth against credential
  // stuffing / brute force at the edge.
  const betterAuthIpLimiter =
    process.env.DISABLE_RATE_LIMITS === 'true'
      ? (_req: Request, _res: Response, next: NextFunction) => next()
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 300,
          standardHeaders: true,
          legacyHeaders: false,
          message: { error: 'Too many authentication requests, please try again later.' },
        });
  const { betterAuthHandler } = await import('./routes/auth/betterAuthHandler.js');

  // MCP OAuth: the `mcp` plugin skips the consent page unless the query is
  // EXACTLY `prompt=consent` — a malicious DCR client could send `prompt=none`
  // to mint a token silently. Rewrite every other value (append would loop on
  // duplicated/empty prompt params). Must run before the catch-all handler.
  app.get('/api/auth/v2/mcp/authorize', (req, res, next) => {
    if (req.query.prompt === 'consent') {
      next();
      return;
    }
    const url = new URL(req.originalUrl, 'http://placeholder');
    url.searchParams.delete('prompt');
    url.searchParams.append('prompt', 'consent');
    res.redirect(302, `${url.pathname}${url.search}`);
  });

  app.all('/api/auth/v2/*splat', betterAuthIpLimiter, (req, res, next) => {
    if (!req.headers['x-forwarded-for'] && !req.headers['x-real-ip']) {
      req.headers['x-forwarded-for'] = req.socket.remoteAddress || '0.0.0.0';
    }
    Promise.resolve(betterAuthHandler(req, res)).catch(next);
  });

  // OAuth discovery at the ORIGIN ROOT (RFC 8414/9728) — Better Auth serves
  // these only under its basePath, but clients resolve them at the root.
  {
    const { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } =
      await import('better-auth/plugins');
    const { fromNodeHeaders } = await import('better-auth/node');
    const { auth } = await import('./config/betterAuth.js');
    const serveWellKnown =
      (handler: (request: globalThis.Request) => Promise<globalThis.Response>) =>
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const base = env.BETTER_AUTH_URL ?? `http://${req.headers.host ?? 'localhost'}`;
          const webReq = new globalThis.Request(`${base}${req.originalUrl}`, {
            method: 'GET',
            headers: fromNodeHeaders(req.headers),
          });
          const webRes = await handler(webReq);
          res.status(webRes.status);
          webRes.headers.forEach((value, key) => res.setHeader(key, value));
          res.send(await webRes.text());
        } catch (err) {
          next(err);
        }
      };
    app.get(
      ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/*splat'],
      serveWellKnown(oAuthDiscoveryMetadata(auth))
    );
    app.get(
      ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/*splat'],
      serveWellKnown(oAuthProtectedResourceMetadata(auth))
    );
  }

  // Failing requests only. The POST-to-/api/ exemption that used to sit here
  // hid every error on exactly the routes that matter most — an OAuth token
  // exchange answering `invalid_grant` left no trace at all, and neither did
  // the no-op stream this used to write to.
  app.use(
    morgan('combined', {
      skip: (_req: Request, res: Response) => res.statusCode < 400,
      stream: { write: (message: string) => log.warn(message.trim()) },
    })
  );

  // Cache middleware
  const cacheMiddleware = createCacheMiddleware(redisClient, {
    ttl: 3600,
    excludePaths: ['/api/'],
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
        redis: redisHealth,
      },
    });
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
    },
  });

  // General file upload configuration
  const generalUpload = multer({
    limits: {
      fileSize: 75 * 1024 * 1024, // 75MB
    },
  });

  // Upload middleware for specific routes
  app.use('/subtitler/process', videoUpload.single('video'));
  app.use('/upload', generalUpload.single('file'));

  // Multer error handling
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'Datei ist zu groß. Videos dürfen maximal 150MB groß sein.',
        });
        return;
      }
    }
    next(error);
  });

  // Static files
  const staticFilesPath = path.join(__dirname, '../web/build');

  app.use(
    '/assets',
    express.static(path.join(staticFilesPath, 'assets'), {
      maxAge: '1d',
      etag: true,
      immutable: true,
      dotfiles: 'deny',
    })
  );

  app.use(
    express.static(staticFilesPath, {
      maxAge: '1d',
      etag: true,
      index: false,
      extensions: ['html', 'js', 'css', 'png', 'jpg', 'gif', 'svg', 'ico'],
      dotfiles: 'deny',
    })
  );

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
  app.use(
    '/uploads/exports',
    express.static(path.join(__dirname, 'uploads/exports'), {
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
      },
    })
  );

  // Static directory for sharepic backgrounds
  app.use(
    '/backend-static',
    express.static(path.join(__dirname, 'public'), {
      dotfiles: 'deny',
      setHeaders: (res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400');
      },
    })
  );

  // Request timeout
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(config.requestTimeout);
    next();
  });

  // Sentry error handler (must be before custom error handler).
  //
  // Sentry's default `shouldHandleError` only captures 5xx, which silently
  // drops every Better Auth credential / OAuth-state / JWT failure (all 4xx).
  // Widen to also capture 400/401/403 — the auth failure universe — while
  // still excluding noisy 404s and benign 422 validations.
  Sentry.setupExpressErrorHandler(app, {
    shouldHandleError(error) {
      const raw = error.statusCode ?? error.status ?? error.output?.statusCode ?? 500;
      const status = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
      if (!Number.isFinite(status)) return true;
      return status >= 500 || status === 400 || status === 401 || status === 403;
    },
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    // Prevent "Cannot set headers after they are sent" errors
    if (res.headersSent) {
      log.warn(`Error after headers sent: ${err.message} | ${req.method} ${req.path}`, {
        stack: err.stack,
      });
      return;
    }

    const isDev = env.NODE_ENV === 'development';
    let errorMessage = 'Bitte versuchen Sie es später erneut';
    let statusCode = isHttpError(err) ? err.status : 500;

    // 4xx are client errors (malformed JSON body, bad params, …) — noise at ERROR
    // level. Log them compactly at warn without a stack; reserve ERROR + stack for 5xx.
    if (statusCode >= 400 && statusCode < 500) {
      log.warn(
        `[GlobalErrorHandler] ${err.name}: ${err.message} | ${req.method} ${req.path} (${statusCode})`
      );
    } else {
      log.error(`[GlobalErrorHandler] ${err.name}: ${err.message} | ${req.method} ${req.path}`, {
        path: req.path,
        method: req.method,
        statusCode,
        errorCode: (err as NodeJS.ErrnoException).code,
        stack: err.stack,
      });
    }

    if (req.path.startsWith('/api/auth/v2/')) {
      log.error(`[BetterAuth] Error on ${req.path}: ${err.message}`, {
        stack: err.stack,
        query: req.query,
        params: req.params,
      });
      res.redirect('/auth/login?error=auth_failed');
      return;
    }

    if (
      err.name === 'AuthenticationError' ||
      (err.message && err.message.includes('authentication'))
    ) {
      statusCode = 401;
      errorMessage = 'Authentifizierung fehlgeschlagen. Bitte melden Sie sich erneut an.';

      if (req.accepts('html') && !req.xhr) {
        res.redirect('/auth/login');
        return;
      }
    } else if (err.message && err.message.includes('Index-Datei nicht gefunden')) {
      errorMessage =
        'Die Anwendung konnte nicht geladen werden. Bitte kontaktieren Sie den Administrator.';
    } else if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      errorMessage = 'Eine benötigte Datei wurde nicht gefunden.';
    } else if ((err as NodeJS.ErrnoException).code === 'EACCES') {
      errorMessage = 'Zugriffsfehler beim Lesen einer Datei.';
    }

    // Der Rohtext verlässt den Server nur unter NODE_ENV === 'development'
    // (`isDev`, oben) — dieselbe Bedingung, die unten schon den Stack trägt.
    // `no-raw-error-to-client` sieht die Verzweigung nicht und hat hier bis
    // hierher acht Mal ein eslint-disable verlangt, das lint-staged jedes Mal
    // wieder wegoptimiert hat (die Regel prüft nur den DIREKTEN Property-Wert).
    // Eine Variable überlebt den Hook, ein Kommentar nicht.
    const responseMessage = isDev ? err.message : errorMessage;

    res.status(statusCode).json({
      success: false,
      error: 'Ein Serverfehler ist aufgetreten',
      message: responseMessage,
      stack: isDev ? err.stack : undefined,
      errorId: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      errorCode: (err as NodeJS.ErrnoException).code,
      errorType: err.name,
    });
  });

  // Create HTTP server
  const server = http.createServer(config.httpOptions, app);

  // Attach realtime voice WebSocket handler
  try {
    const { attachRealtimeWebSocket } = await import('./routes/voice/realtimeHandler.js');
    attachRealtimeWebSocket(server);
    log.debug('Realtime voice WebSocket handler attached');
  } catch (error) {
    log.warn(`Realtime voice WebSocket init failed: ${(error as Error).message}`);
  }

  // Socket keep-alive configuration
  server.on('connection', (socket) => {
    socket.setKeepAlive(true, config.socketKeepAliveInterval);
  });

  // Worker shutdown handler
  const shutdownHandler = createWorkerShutdownHandler({
    resources: [redisClient, { shutdown: () => shutdownLangfuseTelemetry() }].filter(Boolean),
    server,
    logger: log,
  });
  shutdownHandler.registerSignalHandlers();

  // Start server
  server.listen(config.port, config.host, () => {
    log.info(
      `Worker ${process.pid} listening on http://${config.host}:${config.port} (instance: ${CURRENT_INSTANCE})`
    );

    // Warm the research filter cache in the background (non-blocking)
    import('./routes/research/researchController.js')
      .then(({ warmFilterCache }) => warmFilterCache())
      .catch(() => {});
  });
}
