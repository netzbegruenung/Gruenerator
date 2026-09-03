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

/**
 * The KugelAudio voices a person may pick for speech output. Provider ids,
 * frozen (F1): a renamed or retired voice keeps its id here until the profiles
 * that carry it are migrated. Display names live in
 * `@gruenerator/shared/settings` (ttsVoices.ts); the order there is the order
 * the voices are numbered in, so append, never reorder.
 */
export const ttsVoiceIdSchema = z.enum([
  '1930',
  '1887',
  '1885',
  '1876',
  '1840',
  '1708',
  '1707',
  '1705',
  '1704',
  '1660',
  '1659',
  '1657',
  '980',
  '979',
  '978',
  '973',
  '972',
]);
export type TtsVoiceId = z.infer<typeof ttsVoiceIdSchema>;
/** What every synthesis uses when the profile names no voice. */
export const DEFAULT_TTS_VOICE_ID: TtsVoiceId = '1885';

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

/**
 * The one source of truth for the Protokoll kinds. Both the frontend hook and
 * protokollService used to re-declare this union by hand; a z.enum crossing the
 * wire is F0, so consumers derive from it rather than restating it.
 */
export const protokollTypSchema = z.enum([
  'Sitzungsprotokoll',
  'Ergebnisprotokoll',
  'Verlaufsprotokoll',
]);
export type ProtokollTyp = z.infer<typeof protokollTypSchema>;

export const protokollBodySchema = z.object({
  inputText: z.string().min(1),
  protokollTyp: protokollTypSchema.nullish(),
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
  // Present on diarized responses. The frontend type always carried this while
  // the schema did not, so the two had quietly drifted apart.
  speakerId: z.string().nullish(),
});
export type TranscriptionSegment = z.infer<typeof transcriptionSegmentSchema>;

/** `speaker_N` → display name, as detected by identifySpeakers. */
export const speakerMapSchema = z.record(z.string(), z.string());

// ── Response schemas ────────────────────────────────────────────────────────

export const transcribeResponseSchema = z.object({
  success: z.boolean(),
  text: z.string().nullish(),
  segments: z.array(transcriptionSegmentSchema).nullish(),
  hasTimestamps: z.boolean().nullish(),
  speakerMap: speakerMapSchema.nullish(),
  language: z.string().nullish(),
  sourceUrl: z.string().nullish(),
  error: z.string().nullish(),
});

export const protokollResponseSchema = z.object({
  success: z.boolean(),
  content: z.string().nullish(),
  error: z.string().nullish(),
});

export const identifySpeakersResponseSchema = z.object({
  success: z.boolean(),
  mapping: speakerMapSchema.nullish(),
  error: z.string().nullish(),
});

export const todoListResponseSchema = z.object({
  success: z.boolean(),
  content: z.string().nullish(),
  // Set when the input was cut to fit the extraction prompt, so the UI can say
  // so instead of presenting a partial list as a complete one.
  truncated: z.boolean().nullish(),
  coveredChars: z.number().nullish(),
  totalChars: z.number().nullish(),
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

// ── SSE events for POST /api/voice/transcribe-upload/stream ────────────────

/**
 * ts-rest cannot model an SSE response, so this route has no contract entry —
 * but its event shape still crosses the wire and still needs one definition
 * rather than a hand-written copy in the consuming hook.
 */
export const transcribeStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('extraction_start') }),
  z.object({
    type: z.literal('extraction_progress'),
    percent: z.number().nullish(),
    timemark: z.string().nullish(),
  }),
  z.object({ type: z.literal('extraction_complete'), audioSizeMB: z.number().nullish() }),
  z.object({ type: z.literal('transcription_start') }),
  z.object({ type: z.literal('text.delta'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    text: z.string().nullish(),
    segments: z.array(transcriptionSegmentSchema).nullish(),
    hasTimestamps: z.boolean().nullish(),
    speakerMap: speakerMapSchema.nullish(),
  }),
  z.object({ type: z.literal('error'), text: z.string().nullish() }),
]);
export type TranscribeStreamEvent = z.infer<typeof transcribeStreamEventSchema>;

// ── Inferred response types (derive; never restate these by hand) ───────────

export type TranscribeResponse = z.infer<typeof transcribeResponseSchema>;
export type ProtokollResponse = z.infer<typeof protokollResponseSchema>;
export type TodoListResponse = z.infer<typeof todoListResponseSchema>;
export type IdentifySpeakersResponse = z.infer<typeof identifySpeakersResponseSchema>;
export type VoiceErrorResponse = z.infer<typeof voiceErrorResponseSchema>;
