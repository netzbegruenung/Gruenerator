import * as winston from 'winston';

import { env } from '../config/env.js';

const LOG_LEVEL = env.LOG_LEVEL;

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, service }) => {
      const svc = service ? `[${service}]` : '';
      return `${timestamp} ${level.toUpperCase().padEnd(5)} ${svc} ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

export const createLogger = (service: string): winston.Logger => logger.child({ service });
export default logger;
