import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0,
  });
}
