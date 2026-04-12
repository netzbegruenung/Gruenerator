import * as Sentry from '@sentry/node';

// Load env vars so SENTRY_DSN is available (GlitchTip — Sentry-compatible)
import 'dotenv/config';

import { env } from './config/env.js';

const dsn = env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    enabled: env.NODE_ENV === 'production',
    tracesSampleRate: 0,
  });
}
