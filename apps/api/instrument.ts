import * as Sentry from '@sentry/node';

// Load env vars so SENTRY_DSN is available (GlitchTip — Sentry-compatible)
import 'dotenv/config';

import { env } from './config/env.js';
import { initLangfuseTelemetry } from './services/telemetry/langfuseTelemetry.js';

const dsn = env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    enabled: env.NODE_ENV === 'production',
    tracesSampleRate: 0,
  });
}

// After Sentry so we can detect whether it already installed a context manager.
// No-op unless LANGFUSE_* env vars are set. Runs in every cluster worker (this
// file is --import'ed before server.ts).
initLangfuseTelemetry();
