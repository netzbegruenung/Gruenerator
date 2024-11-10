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
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const multer = require('multer');
const axios = require('axios');
const { setupRoutes } = require('./routes');

// Load environment variables
dotenv.config();

// Cluster-Konfiguration
if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork Workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    // Worker neu starten wenn er stirbt
    cluster.fork();
  });
} else {
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

  const app = express();
  const port = process.env.PORT || 3001;
  const host = process.env.HOST || "127.0.0.1";

  // Redis-basiertes Rate Limiting
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
    'https://gruenerator.netzbegruenung.verdigado.net',
    'https://gruenerator.de',
    'https://beta.gruenerator.de',
    'https://jitvshdwttfvtqsjpdzw.supabase.co',
    'https://gruenerator-test.netzbegruenung.verdigado.net'
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
    allowedHeaders: ['Content-Type', 'Authorization'],
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
        connectSrc: ["'self'", ...allowedOrigins, "https://api.unsplash.com", "https://*.supabase.co"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
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
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
  
  // Logging nur für wichtige Requests
  app.use(morgan('combined', {
    skip: function (req, res) {
      return req.url.includes('/api/') && req.method === 'POST' || res.statusCode < 400;
    },
    stream: { write: message => logger.info(message.trim()) }
  }));

  // Rate Limiting
  app.use(redisRateLimiter);

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

  // Server starten
  http.createServer(app).listen(port, host, () => {
    logger.info(`Worker ${process.pid} started - HTTP Server running at http://${host}:${port}`);
  });
}

// Hilfsfunktionen
const isValidUnsplashUrl = (url) => {
  return url.startsWith('https://images.unsplash.com/') || 
         url.startsWith('https://api.unsplash.com/');
};
