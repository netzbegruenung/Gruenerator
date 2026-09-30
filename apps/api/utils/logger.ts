import * as Sentry from '@sentry/node';
import * as winston from 'winston';
import TransportStream from 'winston-transport';

import { env } from '../config/env.js';

import { redactPii } from './logRedaction.js';

const LOG_LEVEL = env.LOG_LEVEL;

// No-op unless Sentry initialised with enableLogs (instrument.ts).
const SentryWinstonTransport = Sentry.createSentryWinstonTransport(TransportStream, {
  levels: ['warn', 'error'],
});

// Sentry serialises an Error attribute as "{}"; send its stack text instead.
const errorsToText = winston.format((info) => {
  for (const [key, value] of Object.entries(info)) {
    if (value instanceof Error) info[key] = value.stack ?? `${value.name}: ${value.message}`;
  }
  return info;
});

// GlitchTip is a third party: warn/error records leave the process, so scrub
// personal data there. The Console transport keeps the full record. Runs after
// errorsToText so stack text is scrubbed too, and rebuilds values instead of
// mutating them (nested objects are shared with the Console transport).
const redactForGlitchTip = winston.format((info) => {
  for (const [key, value] of Object.entries(info)) {
    if (key === 'level') continue;
    info[key] = redactPii(value);
  }
  return info;
});

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
      // The WeakSet drops circular refs: Axios errors carry a ClientRequest
      // whose req/res close a cycle, and an unguarded JSON.stringify would
      // throw mid-log and surface as an unhandled 500 instead of the error.
      const seen = new WeakSet<object>();
      const meta = Object.keys(rest).length
        ? ' ' +
          JSON.stringify(rest, (_k: string, v: unknown) => {
            if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
            if (typeof v === 'object' && v !== null) {
              if (seen.has(v)) return '[Circular]';
              seen.add(v);
            }
            return v;
          })
        : '';
      return `${timestamp} ${level.toUpperCase().padEnd(5)} ${svc} ${message}${meta}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new SentryWinstonTransport({
      format: winston.format.combine(errorsToText(), redactForGlitchTip()),
    }),
  ],
});

export const createLogger = (service: string): winston.Logger => logger.child({ service });
export default logger;
