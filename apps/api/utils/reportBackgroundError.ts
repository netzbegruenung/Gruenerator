import { Sentry } from '../lib/sentry.js';

import { createLogger } from './logger.js';

const log = createLogger('background');

interface BackgroundErrorContext {
  /** Short stable identifier for the job, e.g. 'subtitler-transcription'. */
  job: string;
  [key: string]: unknown;
}

/**
 * Report a swallowed background-job failure: log it readably AND surface it to
 * Sentry/Glitchtip.
 *
 * Fire-and-forget jobs (transcription, exports, document OCR, chat
 * post-response work) catch their own errors and write a status to Redis/DB so
 * the request can return early. Without this, the failure only ever lands in a
 * status string the user sees — it never reaches monitoring, so the same bug
 * can fail thousands of times invisibly. Pass the original error plus a `job`
 * tag and any context worth grouping on.
 */
export function reportBackgroundError(error: unknown, ctx: BackgroundErrorContext): void {
  const { job, ...extra } = ctx;
  const message = error instanceof Error ? error.message : String(error);

  // Single interpolated message + structured meta; the logger serializes Error
  // objects (name/message/stack) but mangles a bare string passed as a 2nd arg.
  log.error(`[${job}] background job failed: ${message}`, { error, ...extra });

  Sentry.captureException(error, { tags: { background_job: job }, extra });
}
