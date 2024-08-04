const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const http = require('http');
const path = require('path');
//const helmet = require('helmet');
//const rateLimit = require('express-rate-limit');
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

const allowedOrigins = ['https://gruenerator-test.de'];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};

// Security middleware
//app.use(helmet());
//app.use(rateLimit({
  //windowMs: 15 * 60 * 1000, // 15 minutes
 // max: 100 // limit each IP to 100 requests per windowMs
//}));

// Fügen Sie diese neue Middleware für die Content Security Policy hinzu
app.use((req, res, next) => {
  res.setHeader(
  'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; connect-src 'self'"
  );
  next();
});
// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(cors(corsOptions));
app.use(morgan('combined', {
  skip: function (req, res) {
    return req.url.includes('/api/') && req.method === 'POST';
  },
  stream: { write: message => logger.info(message.trim()) }
}));

// Middleware für multer
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// Beispielroute für Datei-Upload (dies sollte in Ihren Routendateien erfolgen)
// app.post('/upload', upload.single('image'), (req, res) => {
//   // Ihre Logik hier
//   res.send('Datei hochgeladen');
// });

logger.info('Middleware configured');

app.get('/api/proxy-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).send('Image URL is required');
    }

    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'stream'
    });

    res.set('Content-Type', response.headers['content-type']);
    res.set('Content-Length', response.headers['content-length']);
    response.data.pipe(res);
  } catch (error) {
    logger.error('Error proxying image:', error);
    res.status(500).send('Error proxying image');
  }
});

// Serve static files
app.use(express.static('/var/www/html'));
logger.info('Static file serving configured');

// Root route
app.get('/', (req, res) => {
  logger.info('Root route accessed');
  res.sendFile(path.join('/var/www/html', 'index.html'));
});

// Setup routes
setupRoutes(app);

// Catch-all route for undefined routes
app.get('*', (req, res) => {
  logger.info('Catch-all route accessed');
  res.sendFile(path.join('/var/www/html', 'index.html'));
});

// Error handling middleware
app.use(errorHandler);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));  // Hier wird der Pfad zum statischen Verzeichnis konfiguriert
logger.info('Static file serving configured');

// Starting the HTTP Server
http.createServer(app).listen(port, host, () => { 
  logger.info(`HTTP Server running at http://localhost:${port}`);
});

// Log all registered routes
logger.info('Registered routes:');
app._router.stack.forEach(function(r){
    if (r.route && r.route.path){
      logger.info(r.route.stack[0].method.toUpperCase() + ' ' + r.route.path)
    }
});
