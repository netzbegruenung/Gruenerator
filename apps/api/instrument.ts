import * as Sentry from '@sentry/node';

// Load env vars so SENTRY_DSN is available
import 'dotenv/config';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0,
  });
}
