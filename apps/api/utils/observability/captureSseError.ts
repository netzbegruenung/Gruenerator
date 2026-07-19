import * as Sentry from '@sentry/node';

import { createLogger } from '../logger.js';

const log = createLogger('captureSseError');

interface SseErrorOptions {
  /**
   * Short stable identifier for grouping, e.g. 'thread-not-found'. When omitted
   * the (normalized) message is used as the fingerprint — fine for the static
   * PROGRESS_MESSAGES strings, less so for messages with interpolated ids.
   */
  code?: string;
  /** The human-readable error string emitted to the client over SSE. */
  message: string;
  /**
   * 'warning' for in-band conditions the server recovers from or that are the
   * client's fault (validation, recovered races); 'error' for genuine server
   * failures. Defaults to 'warning' — an SSE error event is a 200 stream, not a
   * crash, so it shouldn't page by default.
   */
  level?: 'warning' | 'error';
  extras?: Record<string, unknown>;
}

// In-band SSE errors that are expected steady-state noise, not incidents:
//   - Unauthorized: an unauthenticated/expired chat attempt; the client logs in
//     again. Equivalent to the benign 401s captureAuthIssue already suppresses.
//   - client disconnects mid-stream (browser navigated away, network drop).
const BENIGN_MESSAGE_PATTERNS: RegExp[] = [
  /^unauthorized$/i,
  /ECONNRESET|ECONNABORTED|aborted|premature close/i,
];

const BENIGN_CODES = new Set(['unauthorized', 'aborted']);

function isBenign(message: string, code?: string): boolean {
  if (code && BENIGN_CODES.has(code)) return true;
  return BENIGN_MESSAGE_PATTERNS.some((re) => re.test(message));
}

/**
 * Surface an in-band SSE `error` event to Sentry/GlitchTip.
 *
 * SSE errors are control-flow *data* written onto an already-200 stream
 * (`sse.send('error', …)`), so they never throw, never hit `next(err)`, and are
 * therefore invisible to both the Express error handler and Sentry's automatic
 * instrumentation. This whole class of "handled, returned-to-client" chat
 * failures used to fail silently — the same bug could fire thousands of times
 * with zero monitoring signal. This is the SSE counterpart to
 * {@link reportBackgroundError}: it logs readably AND reports to GlitchTip with
 * a `chat.sse_code` tag so failures group by type and you can watch their rate.
 *
 * Benign noise (unauthenticated attempts, client disconnects) is suppressed.
 * Never throws — instrumentation must not be able to break the stream.
 */
export function captureSseError(opts: SseErrorOptions): void {
  try {
    if (isBenign(opts.message, opts.code)) {
      log.debug(`[sse] benign error suppressed: ${opts.message}`);
      return;
    }

    const code = opts.code ?? opts.message;
    const level = opts.level ?? 'warning';

    Sentry.withScope((scope) => {
      scope.setLevel(level);
      scope.setTag('chat.sse_code', code);
      scope.setFingerprint(['chat-sse', code]);
      if (opts.extras) scope.setExtras(opts.extras);
      Sentry.captureMessage(`[sse] ${opts.message}`);
    });

    log.error(`[sse] ${opts.message}`, opts.extras);
  } catch (err) {
    // Last-resort: instrumentation failure must never bubble into the stream.
    log.warn(`[sse] captureSseError failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
