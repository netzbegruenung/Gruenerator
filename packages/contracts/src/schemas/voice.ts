/**
 * Zod schemas for voice endpoints.
 * Mirrors apps/api/routes/voice/voiceController.ts.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production rule.
 *
 * NOTE: File-upload routes (multer-based POST /transcribe, POST /transcribe/stream,
 * POST /chat) are NOT covered — ts-rest does not cleanly model multipart.
 */
import { z } from 'zod';

// ── Request bodies ──────────────────────────────────────────────────────────

export const tusTranscribeBodySchema = z.object({
  uploadId: z.string().min(1),
  language: z.string().nullish(),
  diarize: z.boolean().nullish(),
  timestamps: z.boolean().nullish(),
});

export const transcribeUrlBodySchema = z.object({
  url: z.string().min(1),
  language: z.string().nullish(),
  removeTimestamps: z.boolean().nullish(),
  timestamps: z.boolean().nullish(),
  diarize: z.boolean().nullish(),
  contextBias: z.array(z.string()).nullish(),
});

export const protokollBodySchema = z.object({
  inputText: z.string().min(1),
  protokollTyp: z.enum(['Sitzungsprotokoll', 'Ergebnisprotokoll', 'Verlaufsprotokoll']).nullish(),
});

export const identifySpeakersBodySchema = z.object({
  text: z.string().min(1),
});

export const todoListBodySchema = z.object({
  text: z.string().min(1),
  title: z.string().nullish(),
});

// ── Sub-schemas ─────────────────────────────────────────────────────────────

export const transcriptionSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const transcribeResponseSchema = z.object({
  success: z.boolean(),
  text: z.string().nullish(),
  segments: z.array(transcriptionSegmentSchema).nullish(),
  hasTimestamps: z.boolean().nullish(),
  speakerMap: z.unknown().nullish(),
  language: z.string().nullish(),
  sourceUrl: z.string().nullish(),
  error: z.string().nullish(),
});

export const protokollResponseSchema = z.object({
  success: z.boolean(),
  content: z.unknown().nullish(),
  error: z.string().nullish(),
});

export const identifySpeakersResponseSchema = z.object({
  success: z.boolean(),
  mapping: z.unknown().nullish(),
  error: z.string().nullish(),
});

export const todoListResponseSchema = z.object({
  success: z.boolean(),
  content: z.unknown().nullish(),
  error: z.string().nullish(),
});

export const formatsResponseSchema = z.object({
  success: z.boolean(),
  supportedFormats: z.array(z.string()).nullish(),
  maxFileSize: z.string().nullish(),
  maxDuration: z.string().nullish(),
  provider: z.string().nullish(),
  error: z.string().nullish(),
});

export const voiceErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.string(),
});
