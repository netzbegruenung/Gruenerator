/**
 * Turning thrown values into something a user may read.
 *
 * Tooling output (FFmpeg/ffprobe stderr, driver messages, stack traces) is
 * meaningless to users and leaks internals, so it never reaches a response
 * body or a job status. Known failure signatures map to a curated German
 * message plus a machine-readable code from the shared job-error taxonomy;
 * everything else collapses to one generic message.
 *
 * `toJobError()` is the funnel: it logs the raw error together with the
 * `errorId` it returns, so a user quoting that id in a support request leads
 * straight to the log line.
 */
import { randomUUID } from 'crypto';

import { type JobError, type JobErrorCode } from '@gruenerator/contracts';

import { createLogger } from '../logger.js';

export const GENERIC_ERROR_MESSAGE =
  'Da ist etwas schiefgegangen. Bitte versuche es erneut – wenn es weiterhin nicht klappt, melde dich beim Support.';

interface FailureRule {
  pattern: RegExp;
  code: JobErrorCode;
  message: string;
  retryable: boolean;
}

/** Most specific first — the first match wins. */
const FAILURE_RULES: readonly FailureRule[] = [
  {
    pattern: /No space left on device|ENOSPC|Disk quota exceeded/i,
    code: 'storage_full',
    message:
      'Auf dem Server ist gerade kein Speicherplatz frei. Bitte versuche es in ein paar Minuten erneut.',
    retryable: true,
  },
  {
    pattern:
      /bit depth|Error setting profile|Possible profiles|pix_fmt|Unknown encoder|Unsupported/i,
    code: 'unsupported_media',
    message:
      'Das Format dieser Datei wird nicht unterstützt. Bitte exportiere sie als MP4 (H.264, 8 Bit) und lade sie erneut hoch.',
    retryable: false,
  },
  {
    pattern: /moov atom not found|Invalid data found|could not find codec parameters|End of file/i,
    code: 'media_unreadable',
    message:
      'Die Datei konnte nicht gelesen werden. Bitte lade sie erneut hoch oder exportiere sie vorher als MP4 (H.264).',
    retryable: false,
  },
  {
    pattern: /does not contain any stream|Output file .* does not contain|no streams/i,
    code: 'media_incomplete',
    message:
      'In der Datei wurde keine Videospur gefunden. Bitte prüfe die Datei und lade sie erneut hoch.',
    retryable: false,
  },
  {
    pattern: /ENOENT|no such file or directory|nicht gefunden/i,
    code: 'media_missing',
    message: 'Die Datei wurde nicht mehr gefunden. Bitte lade sie erneut hoch.',
    retryable: false,
  },
  {
    pattern: /timed out|timeout|ETIMEDOUT|SIGKILL|killed with signal/i,
    code: 'timed_out',
    message:
      'Die Verarbeitung hat zu lange gedauert und wurde abgebrochen. Bitte versuche es mit einer kürzeren oder kleineren Datei.',
    retryable: true,
  },
  {
    pattern:
      /ECONNREFUSED|ECONNRESET|EAI_AGAIN|socket hang up|fetch failed|Service Unavailable|Too Many Requests|rate limit|\b(429|502|503)\b/i,
    code: 'provider_unavailable',
    message:
      'Der Dienst ist gerade überlastet oder nicht erreichbar. Bitte versuche es in einem Moment erneut.',
    retryable: true,
  },
  {
    pattern: /Unauthorized|Forbidden|\b(401|403)\b|keine Berechtigung/i,
    code: 'unauthorized',
    message: 'Dir fehlt die Berechtigung für diese Aktion. Bitte melde dich neu an.',
    retryable: false,
  },
];

/** Does this read like tooling output rather than a message we authored? */
function isTechnical(message: string): boolean {
  return (
    /ffmpeg|ffprobe|libx26|x264|x265|avcodec|libav|Conversion failed|exited with code|@ 0x|Parsed_|Stream #|\bE[A-Z]{4,}\b|\bat .+:\d+:\d+/i.test(
      message
    ) ||
    message.includes('\n') ||
    message.length > 200
  );
}

function rawMessageOf(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error ?? '')).trim();
  // Stringifying a non-Error throw yields noise, not a message.
  return raw === '[object Object]' || raw === 'undefined' || raw === 'null' ? '' : raw;
}

/**
 * Classify without logging. Prefer `toJobError()` — it also emits the
 * correlated log line. Use this only where the caller logs the raw error
 * itself.
 */
export function classifyUserFacingError(
  error: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE
): Omit<JobError, 'errorId'> {
  const raw = rawMessageOf(error);
  if (!raw) {
    return { code: 'internal', message: fallback, retryable: true };
  }

  const rule = FAILURE_RULES.find(({ pattern }) => pattern.test(raw));
  if (rule) {
    return { code: rule.code, message: rule.message, retryable: rule.retryable };
  }

  // Messages we wrote ourselves are already user-facing; keep them.
  if (!isTechnical(raw)) {
    return { code: 'internal', message: raw, retryable: true };
  }

  return { code: 'internal', message: fallback, retryable: true };
}

/**
 * Classify a thrown value, log it raw under a fresh `errorId`, and return the
 * user-facing counterpart. Everything written into a job status or an error
 * response body should come from here.
 */
export function toJobError(
  error: unknown,
  context: { scope: string; meta?: Record<string, unknown> }
): JobError {
  const classified = classifyUserFacingError(error);
  const errorId = randomUUID().slice(0, 8);

  createLogger(context.scope).error(`[${errorId}] ${classified.code}: ${rawMessageOf(error)}`, {
    errorId,
    code: classified.code,
    ...context.meta,
    stack: error instanceof Error ? error.stack : undefined,
  });

  return { ...classified, errorId };
}

/**
 * Message-only shortcut for places that cannot carry the structured shape.
 * `fallback` replaces the generic text when the thrown value carries nothing
 * usable — pass the sentence the call site would otherwise have hardcoded.
 */
export function toUserFacingMessage(error: unknown, fallback?: string): string {
  return classifyUserFacingError(error, fallback).message;
}
