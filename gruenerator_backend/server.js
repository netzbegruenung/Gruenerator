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
const { tusServer } = require('./routes/subtitler/services/tusService.js');

// Load environment variables
dotenv.config();

// Globaler Worker-Pool für AI-Anfragen
let aiWorkerPool;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Anzahl der Worker aus Umgebungsvariable lesen oder Standardwert verwenden
  const workerCount = parseInt(process.env.WORKER_COUNT, 10) || 6;
  console.log(`Starting ${workerCount} workers (WORKER_COUNT: ${workerCount})`);

  // Fork Workers
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Verbesserte Worker-Exit-Behandlung
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    // Nur neue Worker starten, wenn es kein geplanter Shutdown war
    if (!worker.exitedAfterDisconnect) {
      console.log('Starting new worker...');
      cluster.fork();
    }
  });

  // Koordinierte Shutdown-Sequenz für den Master
  process.on('SIGTERM', async () => {
    console.log('Master received SIGTERM, initiating graceful shutdown...');
    
    // Benachrichtige alle Worker über den bevorstehenden Shutdown
    const workers = Object.values(cluster.workers);
    await Promise.all(workers.map(worker => {
      return new Promise((resolve) => {
        worker.send({ type: 'shutdown' });
        worker.on('message', (msg) => {
          if (msg.type === 'shutdown-complete') {
            console.log(`Worker ${worker.process.pid} shutdown complete`);
            resolve();
          }
        });
      });
    }));

    // Warte auf Worker-Beendigung
    await Promise.all(workers.map(worker => {
      return new Promise((resolve) => {
        worker.on('exit', () => {
          console.log(`Worker ${worker.process.pid} exited`);
          resolve();
        });
      });
    }));

    console.log('All workers shut down successfully');
    process.exit(0);
  });
} else {
  const app = express();
  
  // Setze Express Limit
  app.use(express.json({limit: '105mb'}));
  app.use(express.raw({limit: '105mb'}));
  
  // Timeout-Einstellungen
  app.use((req, res, next) => {
    res.setTimeout(900000); // 15 Minuten
    next();
  });

  // Worker-Pool für AI-Anfragen initialisieren
  const aiWorkerCount = parseInt(process.env.AI_WORKER_COUNT, 10) || 6;
  console.log(`Initializing AI worker pool with ${aiWorkerCount} workers`);
  aiWorkerPool = new AIWorkerPool(aiWorkerCount);
  app.locals.aiWorkerPool = aiWorkerPool;

  // Multer Konfiguration für Videouploads
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

  // Verbesserte Graceful Shutdown Handler für Worker
  process.on('message', async (msg) => {
    if (msg.type === 'shutdown') {
      console.log(`Worker ${process.pid} received shutdown signal`);
      
      try {
        // Beende AI Worker Pool
        if (aiWorkerPool) {
          console.log('Shutting down AI worker pool...');
          await aiWorkerPool.shutdown();
        }

        // Schließe Redis-Verbindung
        if (redisClient) {
          console.log('Closing Redis connection...');
          await redisClient.quit();
        }

        // Schließe den Server
        server.close(() => {
          console.log(`Worker ${process.pid} server closed`);
          process.send({ type: 'shutdown-complete' });
          process.exit(0);
        });
      } catch (error) {
        console.error(`Error during worker ${process.pid} shutdown:`, error);
        process.exit(1);
      }
    }
  });

  // Fallback für direkte SIGTERM-Signale
  process.on('SIGTERM', async () => {
    console.log(`Worker ${process.pid} received SIGTERM`);
    try {
      if (aiWorkerPool) {
        await aiWorkerPool.shutdown();
      }
      if (redisClient) {
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
  });

  // Redis Client Setup
  const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  redisClient.on('error', (err) => console.log('Redis Client Error', err));

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
          // Alle Subdomains von gruenerator.de (HTTP & HTTPS, falls lokal noch HTTP gebraucht wird)
          "http://*.gruenerator.de",
          "https://*.gruenerator.de",
          // Umlaut-Domain grüenerator.de + Subdomains (Punycode-kodiert)
          "http://*.xn--grnerator-z2a.de",
          "https://*.xn--grnerator-z2a.de",
          // Weiterhin lokale Entwicklungs-URLs
          "http://localhost:*",
          "http://127.0.0.1:*",
          // Falls *.netzbegruenung* genutzt wird
          "http://*.netzbegruenung.verdigado.net",
          "https://*.netzbegruenung.verdigado.net",
          // Zusätzliche erlaubte Domains (z.B. aus allowedOrigins)
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
    stream: { write: message => {} }
  }));

  // Rate Limiting
  // app.use(redisRateLimiter);

  // Cache für statische Dateien
  app.use(cacheMiddleware);

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
  setupRoutes(app);

  // Optimierte statische Datei-Auslieferung für Vite
  const staticFilesPath = path.join(__dirname, '../gruenerator_frontend/build');
  
  // API-Routen zuerst
  setupRoutes(app);

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
    if (req.path.startsWith('/api/')) {
      return next();
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

  // Füge einen Middleware vor der Catch-all Route hinzu, um 404-Fehler zu loggen
  app.use((req, res, next) => {
    // Nur für statische Dateianfragen
    next();
  });

  // Root und Catch-all Routes
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

  // Error Handler 
  app.use((err, req, res, next) => {
    // Bestimme, ob wir in der Entwicklungsumgebung sind
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Prüfe auf spezifische Fehlertypen
    let errorMessage = 'Bitte versuchen Sie es später erneut';
    
    if (err.message && err.message.includes('Index-Datei nicht gefunden')) {
      errorMessage = 'Die Anwendung konnte nicht geladen werden. Bitte kontaktieren Sie den Administrator.';
    } else if (err.code === 'ENOENT') {
      errorMessage = 'Eine benötigte Datei wurde nicht gefunden.';
    } else if (err.code === 'EACCES') {
      errorMessage = 'Zugriffsfehler beim Lesen einer Datei.';
    }
    
    // Sende eine strukturierte Fehlerantwort
    res.status(500).json({
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

  server.listen(port, host, () => {
    console.log(`Worker ${process.pid} started - Server running at http://${host}:${port}`);
  });
}
