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
    tracesSampleRate: 0.1,
    // GlitchTip ingests transactions but drops the streamed `span` envelope
    // items that are the v11 default, so tracing would silently go dark.
    traceLifecycle: 'static',
    // v11 collects user info, cookies, bodies, DB queries and GenAI/MCP
    // inputs/outputs unless told otherwise. Pin the v10 default (the old
    // `sendDefaultPii: false`): GlitchTip is a third party.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
    // Errors are captured by our own middleware in server.ts, which also keeps
    // the 400/401/403 auth failures the integration's default would drop.
    integrations: [Sentry.expressIntegration({ shouldHandleError: false })],
    // Logs need no switch any more: the Winston transport in utils/logger.ts
    // sends them, and only warn/error (info logs carry user ids).
  });
}

// No-op unless LANGFUSE_* env vars are set. Runs in every cluster worker (this
// file is --import'ed before server.ts).
initLangfuseTelemetry();
