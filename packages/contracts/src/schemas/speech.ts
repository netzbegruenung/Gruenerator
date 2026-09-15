/**
 * Zod schemas for Grünerator Voice — text to a downloadable audio file.
 * Mirrors apps/api/routes/voice/speechContractRouter.ts.
 *
 * Request bodies use `.nullish()` for optional fields per the 2026-04-12
 * production rule (see voice.ts).
 */
import { z } from 'zod';

import { ttsVoiceIdSchema } from './voice.js';
import { SPEECH_MAX_SPEED, SPEECH_MAX_TEXT_CHARS, SPEECH_MIN_SPEED } from './voiceLimits.js';

/**
 * What the recording is for. The preset only carries UI defaults (hint text,
 * output formats, character budget) — the synthesis path is the same for all.
 */
export const speechPresetSchema = z.enum(['mailbox', 'vorlesefassung', 'audiodeskription']);
export type SpeechPreset = z.infer<typeof speechPresetSchema>;

/**
 * `wav_phone` is 8 kHz mono PCM16 — the greeting format Fritz!Box, Asterisk
 * and 3CX accept. `mp3` is for everything a person or a website plays.
 */
export const speechOutputFormatSchema = z.enum(['mp3', 'wav_phone']);
export type SpeechOutputFormat = z.infer<typeof speechOutputFormatSchema>;

/** What the encoder writes and the Mediathek row stores; one per output format. */
export const speechMimeTypeSchema = z.enum(['audio/mpeg', 'audio/wav']);
export type SpeechMimeType = z.infer<typeof speechMimeTypeSchema>;

export const generateSpeechBodySchema = z.object({
  preset: speechPresetSchema,
  text: z.string().trim().min(1).max(SPEECH_MAX_TEXT_CHARS),
  /** Absent → the person's voice from the settings → the product default. */
  voiceId: ttsVoiceIdSchema.nullish(),
  formats: z
    .array(speechOutputFormatSchema)
    .min(1)
    .refine((formats) => new Set(formats).size === formats.length, {
      message: 'Jedes Format höchstens einmal',
    }),
  speed: z.number().min(SPEECH_MIN_SPEED).max(SPEECH_MAX_SPEED).nullish(),
});
export type GenerateSpeechBody = z.infer<typeof generateSpeechBodySchema>;

export const speechFileSchema = z.object({
  format: speechOutputFormatSchema,
  mediaId: z.string(),
  /**
   * The key to everything else: clients build `<api base>/share/<token>/stream`
   * (Range-capable, what an `<audio>` plays) and `/download` themselves, because
   * only they know their API base.
   */
  shareToken: z.string(),
  mimeType: speechMimeTypeSchema,
  fileSize: z.number(),
  /** `/share/<token>` — the public page, relative to the web origin. */
  shareUrl: z.string(),
});
export type SpeechFile = z.infer<typeof speechFileSchema>;

export const generateSpeechResponseSchema = z.object({
  success: z.literal(true),
  durationSeconds: z.number(),
  /** How many provider requests the text needed (long texts are split). */
  chunks: z.number(),
  files: z.array(speechFileSchema),
  quota: z.object({
    usedSeconds: z.number(),
    limitSeconds: z.number(),
  }),
});
export type GenerateSpeechResponse = z.infer<typeof generateSpeechResponseSchema>;

export const speechErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});
export type SpeechError = z.infer<typeof speechErrorSchema>;
