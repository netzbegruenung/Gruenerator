/**
 * Failure taxonomy for asynchronous jobs (video export, transcription,
 * rendering, long-running generation).
 *
 * Async jobs report through a polled status document, so they never pass the
 * Express error handler and nothing curates their message. Before this
 * taxonomy each job wrote `error.message` straight into the status — which is
 * how raw FFmpeg stderr ended up in the UI on web *and* mobile.
 *
 * The shape mirrors the chat streaming taxonomy (`chatErrorCodeSchema`):
 * a machine-readable `code` the UI can branch on, a curated German `message`,
 * a `retryable` flag that decides whether a retry button makes sense, and an
 * `errorId` that also appears in the backend log line for support.
 */
import { z } from 'zod';

export const jobErrorCodeSchema = z.enum([
  /** Input is readable but we cannot process this format/variant. */
  'unsupported_media',
  /** File is damaged, truncated, or not the media type it claims to be. */
  'media_unreadable',
  /** Source file is gone (expired upload, cleaned up, wrong id). */
  'media_missing',
  /** No video/audio track where one is required. */
  'media_incomplete',
  /** Server ran out of disk. */
  'storage_full',
  /** Job exceeded its time budget or was killed. */
  'timed_out',
  /** Upstream provider (transcription, AI) refused or was unavailable. */
  'provider_unavailable',
  /** Caller is not allowed to run this job. */
  'unauthorized',
  /** Request itself was malformed — retrying unchanged will not help. */
  'invalid_request',
  /** Anything unclassified. */
  'internal',
]);
export type JobErrorCode = z.infer<typeof jobErrorCodeSchema>;

export const jobErrorSchema = z.object({
  code: jobErrorCodeSchema,
  /** Curated, user-facing German text. Never raw tooling output. */
  message: z.string(),
  /** Whether retrying the identical job could plausibly succeed. */
  retryable: z.boolean(),
  /** Correlates the UI message with the backend log line. */
  errorId: z.string(),
});
export type JobError = z.infer<typeof jobErrorSchema>;

/**
 * Wire shape of a failed job status. `error` stays a plain string so clients
 * that predate this taxonomy (shipped mobile builds poll the same key) keep
 * rendering a sensible message; the structured fields are additive.
 */
export const jobErrorStatusSchema = z.object({
  status: z.literal('error'),
  error: z.string(),
  errorCode: jobErrorCodeSchema.optional(),
  retryable: z.boolean().optional(),
  errorId: z.string().optional(),
});
export type JobErrorStatus = z.infer<typeof jobErrorStatusSchema>;

/** Spread into a job status document. */
export function toJobErrorStatus(error: JobError): JobErrorStatus {
  return {
    status: 'error',
    error: error.message,
    errorCode: error.code,
    retryable: error.retryable,
    errorId: error.errorId,
  };
}
