import 'dotenv/config';

import * as Sentry from '@sentry/node';

// GlitchTip is Sentry-API-compatible, so the Sentry SDK talks to it unchanged.
// Prefer a dedicated MCP DSN; fall back to the shared backend DSN (already
// rendered into the container env as SENTRY_DSN) so bugs are captured out of the
// box. Every event is tagged `service: mcp` to stay filterable when the DSN is
// shared with the API's project.
const dsn = process.env.SENTRY_DSN_MCP || process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0,
    initialScope: { tags: { service: 'mcp' } },
  });
  console.log('[Boot] GlitchTip error tracking initialized');
} else {
  console.log('[Boot] GlitchTip disabled (no SENTRY_DSN_MCP / SENTRY_DSN)');
}
