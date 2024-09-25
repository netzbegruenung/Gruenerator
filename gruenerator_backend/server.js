const express = require('express');
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
const multer = require('multer');  // Hinzufügen von multer
const axios = require('axios');

const { setupRoutes } = require('./routes');
const { errorHandler } = require('./errorHandler');

// Load environment variables
dotenv.config();

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const app = express();
const port = process.env.PORT || 3001;
const host = process.env.HOST || "127.0.0.1"; 

logger.info(`Server will run on port ${port}`);

const allowedOrigins = [
  'https://gruenerator-test.de', 
  'https://gruenerator.netzbegruenung.verdigado.net', 
  'https://gruenerator.de',
  'https://beta.gruenerator.de'
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

// Anwenden der CORS-Konfiguration auf alle Routen
app.use(cors(corsOptions));

// Explizite Behandlung von OPTIONS-Anfragen für alle Routen
app.options('*', cors(corsOptions));

// Zusätzliche Middleware zur Sicherstellung der CORS-Header
// Diese Zeilen können gelöscht werden:
// app.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', allowedOrigins);
//   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
//   next();
// });

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...allowedOrigins],
      imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com"],
      // Weitere Direktiven nach Bedarf hinzufügen
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 300, // Erhöht auf 300 Anfragen pro Zeitfenster
  message: 'Zu viele Anfragen von dieser IP, bitte versuchen Sie es später erneut.',
  standardHeaders: true, // Füge Standard-RateLimit-Informationen zu den `RateLimit-*` Headern hinzu
  legacyHeaders: false, // Deaktiviere die `X-RateLimit-*` Header
}));

// Zusätzliche Rate-Limiting für spezifische Routen
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 Minuten
  max: 150, // Erhöht auf 150 Anfragen pro 5 Minuten
  message: 'Zu viele API-Anfragen, bitte versuchen Sie es in 5 Minuten erneut.'
});

// Wende das API-Limit auf alle Routen an, die mit /api beginnen
app.use('/api/', apiLimiter);

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('combined', {
  skip: function (req, res) {
    return req.url.includes('/api/') && req.method === 'POST';
  },
  stream: { write: message => logger.info(message.trim()) }
}));

// **Setup routes vor den statischen Dateien und Catch-all-Routen**
setupRoutes(app);

// Serve static files
app.use(express.static('/var/www/html'));
logger.info('Static file serving configured');

// Root route
app.get('/', (req, res) => {
  logger.info('Root route accessed');
  res.sendFile(path.join('/var/www/html', 'index.html'));
});

// Catch-all route for undefined routes
app.get('*', (req, res) => {
  logger.info('Catch-all route accessed');
  res.sendFile(path.join('/var/www/html', 'index.html'));
});

// Serve additional static files (falls erforderlich)
app.use(express.static(path.join(__dirname, 'public')));
logger.info('Static file serving configured');

// Error handling middleware
app.use(errorHandler);

// Starting the HTTP Server
http.createServer(app).listen(port, host, () => { 
  logger.info(`HTTP Server running at http://${host}:${port}`);
});

// Log all registered routes
logger.info('Registered routes:');
app._router.stack.forEach(function(r){
    if (r.route && r.route.path){
      logger.info(`${r.route.stack[0].method.toUpperCase()} ${r.route.path}`);
    }
});
