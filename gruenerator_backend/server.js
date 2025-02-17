const express = require('express');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const Redis = require('redis');
const compression = require('compression');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const helmet = require('helmet');
const winston = require('winston');
const multer = require('multer');
const axios = require('axios');
const { setupRoutes } = require('./routes');
const AIWorkerPool = require('./workers/aiWorkerPool.js');

// Load environment variables
dotenv.config();

// Globaler Worker-Pool für AI-Anfragen
let aiWorkerPool;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Bestimme Anzahl der Worker basierend auf Produktionsmodus
  const workerCount = process.env.PRODUCTION_MODE === 'true' ? numCPUs : 1;
  console.log(`Starting ${workerCount} workers (PRODUCTION_MODE: ${process.env.PRODUCTION_MODE})`);

  // Fork Workers
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  const app = express();
  
  // Setze Express Limit
  app.use(express.json({limit: '100mb'}));
  app.use(express.raw({limit: '100mb'}));
  
  // Timeout-Einstellungen
  app.use((req, res, next) => {
    res.setTimeout(900000); // 15 Minuten
    next();
  });

  // Worker-Pool für AI-Anfragen initialisieren
  const aiWorkerCount = process.env.PRODUCTION_MODE === 'true' ? 4 : 1;
  console.log(`Initializing AI worker pool with ${aiWorkerCount} workers`);
  aiWorkerPool = new AIWorkerPool(aiWorkerCount);
  app.locals.aiWorkerPool = aiWorkerPool;

  // Multer Konfiguration für Videouploads
  const videoUpload = multer({
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB für Videos
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
          error: 'Datei ist zu groß. Videos dürfen maximal 100MB groß sein.'
        });
      }
    }
    next(error);
  });

  // Graceful Shutdown Handler
  process.on('SIGTERM', async () => {
    console.log('Shutting down AI worker pool...');
    if (aiWorkerPool) {
      await aiWorkerPool.shutdown();
    }
    server.close(() => {
      console.log('Server beendet');
      process.exit(0);
    });
  });

  // Redis Client Setup
  const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  redisClient.on('error', (err) => console.log('Redis Client Error', err));

  // Setup logger mit Performance-Optimierungen
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        format: winston.format.simple()
      }),
      new winston.transports.File({ 
        filename: 'error.log', 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    ]
  });

  const port = process.env.PORT || 3001;
  const host = process.env.HOST || "127.0.0.1";

  // Redis-basiertes Rate Limiting
  /*
  const redisRateLimiter = async (req, res, next) => {
    const key = `rate-limit:${req.ip}`;
    try {
      const requests = await redisClient.incr(key);
      if (requests === 1) {
        await redisClient.expire(key, 15 * 60); // 15 Minuten
      }
      if (requests > 1000) { // Limit
        return res.status(429).json({
          error: 'Zu viele Anfragen, bitte später erneut versuchen'
        });
      }
      next();
    } catch (err) {
      next(); // Bei Redis-Fehler weitermachen
    }
  };
  */

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

  // CORS Setup
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
    'https://www.xn--grenerator-z2a.xn--netzbegrnung-dfb.verdigado.net',
    'https://www.xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net',
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
    credentials: true,
    optionsSuccessStatus: 204
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // Security
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.unsplash.com"],
        connectSrc: [
          "'self'", 
          "http://www.gruenerator-test.de",
          "https://www.gruenerator-test.de",
          "http://gruenerator-test.de",
          "https://gruenerator-test.de",
          "http://www.gruenerator.de",
          "https://www.gruenerator.de",
          "http://gruenerator.de",
          "https://gruenerator.de",
          "http://gruenerator-test.netzbegruenung.verdigado.net",
          "https://gruenerator-test.netzbegruenung.verdigado.net",
          "http://www.xn--grenerator-test-4pb.de",
          "https://www.xn--grenerator-test-4pb.de",
          "http://xn--grenerator-test-4pb.de",
          "https://xn--grenerator-test-4pb.de",
          "http://www.xn--grenerator-z2a.de",
          "https://www.xn--grenerator-z2a.de",
          "http://xn--grenerator-z2a.de",
          "https://xn--grenerator-z2a.de",
          "http://xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net",
          "https://xn--grenerator-test-4pb.xn--netzbegrnung-dfb.verdigado.net",
          "http://localhost:*",
          "http://127.0.0.1:*",
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

  // Redis-Cache für statische Dateien
  const cacheMiddleware = async (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const key = `cache:${req.originalUrl}`;
    try {
      const cachedResponse = await redisClient.get(key);
      if (cachedResponse) {
        return res.send(JSON.parse(cachedResponse));
      }
      res.sendResponse = res.send;
      res.send = (body) => {
        redisClient.set(key, JSON.stringify(body), {
          EX: 3600 // 1 Stunde Cache
        });
        res.sendResponse(body);
      };
      next();
    } catch (err) {
      next();
    }
  };

  // Optimierte Middleware-Stack
  app.use(bodyParser.json({ limit: '105mb' }));
  app.use(bodyParser.urlencoded({ limit: '105mb', extended: true }));
  
  // Logging nur für wichtige Requests
  app.use(morgan('combined', {
    skip: function (req, res) {
      return req.url.includes('/api/') && req.method === 'POST' || res.statusCode < 400;
    },
    stream: { write: message => logger.info(message.trim()) }
  }));

  // Rate Limiting
  // app.use(redisRateLimiter);

  // Cache für statische Dateien
  app.use(cacheMiddleware);

  // Routes Setup
  setupRoutes(app);

  // Optimierte statische Datei-Auslieferung
  app.use(express.static('/var/www/html', {
    maxAge: '1d', // Browser-Cache für 1 Tag
    etag: true,
    lastModified: true
  }));

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

  // Setup Routes nach den statischen Verzeichnissen
  setupRoutes(app);

  // Root und Catch-all Routes
  app.get('/', (req, res) => {
    res.sendFile(path.join('/var/www/html', 'index.html'));
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join('/var/www/html', 'index.html'));
  });

  // Error Handler
  app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).send('Something broke!');
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

  server.listen(port, host, () => {
    logger.info(`Worker ${process.pid} started - Server running at http://${host}:${port}`);
  });

  // Middleware für AI-Anfragen
  app.use('/api/*', async (req, res, next) => {
    if (req.method === 'POST' && req.path.includes('claude')) {
      try {
        const result = await aiWorkerPool.processRequest({
          type: req.path.split('/')[2], // Extrahiert den Typ aus dem Pfad
          ...req.body
        });
        return res.json(result);
      } catch (error) {
        console.error('AI Request Error:', error);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
    next();
  });

  // Timeout-Einstellungen für große Dateiübertragungen
  app.use((req, res, next) => {
    req.setTimeout(300000); // 5 Minuten
    res.setTimeout(300000);
    next();
  });
}
