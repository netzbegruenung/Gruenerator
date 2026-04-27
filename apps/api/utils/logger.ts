import * as winston from 'winston';

import { env } from '../config/env.js';

const LOG_LEVEL = env.LOG_LEVEL;

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    // splat() processes printf-style %s/%j/%d substitutions in log calls like
    // `log.info('user %s did %s', userId, action)`. Without it, the format
    // specifiers appear literally in output. Template literals continue to
    // work either way; splat only activates when extra args are passed.
    winston.format.splat(),
    winston.format.printf(({ level, message, timestamp, service, ...rest }) => {
      const svc = service ? `[${service}]` : '';
      // Serialize structured metadata so log.error('msg', { error }) actually
      // surfaces the error in stdout. Without this, second-arg objects are
      // silently dropped by the formatter and failures look mysterious in CI.
      const meta = Object.keys(rest).length
        ? ' ' +
          JSON.stringify(rest, (_k, v) =>
            v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
          )
        : '';
      return `${timestamp} ${level.toUpperCase().padEnd(5)} ${svc} ${message}${meta}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

export const createLogger = (service: string): winston.Logger => logger.child({ service });
export default logger;
