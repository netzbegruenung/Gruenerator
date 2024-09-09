const winston = require('winston');

const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
  ]
});

function errorHandler(err, req, res, next) {
  logger.error(`Error occurred: ${err.message}`);
  res.status(500).send('An error occurred on the server');
}

module.exports = { errorHandler };