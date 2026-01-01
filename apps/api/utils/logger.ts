import * as winston from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, service }) => {
      const svc = service ? `[${service}]` : '';
      return `${timestamp} ${level.toUpperCase().padEnd(5)} ${svc} ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

export const createLogger = (service: string): winston.Logger => logger.child({ service });
export default logger;
