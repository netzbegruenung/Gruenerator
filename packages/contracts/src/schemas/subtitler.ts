/**
 * Zod schemas for subtitler endpoints — single source of truth.
 *
 * Mirrors apps/api/routes/subtitler/{processing,project,share,social}Controller.ts
 * and the shapes written to / read from Redis in the subtitler pipeline.
 *
 * Conventions:
 *   - Request bodies use `.nullish()` for optional fields (2026-04-12 rule).
 *   - All shapes that cross the FE/BE boundary live here. Derive TS types via
 *     `z.infer<typeof schema>` rather than hand-writing interfaces.
 *   - Redis values are validated on read via `parseRedisJson` (see
 *     apps/api/services/subtitler/redisCodecs.ts) — schemas below are the
 *     contract for those values too.
 */
import { z } from 'zod';

// ── Canonical SubtitleSegment ───────────────────────────────────────────────

/**
 * Canonical subtitle segment shape. `startTime` / `endTime` are seconds
 * from video start; `text` is the displayed text for that segment.
 */
export const subtitleSegmentSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

export type SubtitleSegment = z.infer<typeof subtitleSegmentSchema>;

export const subtitleWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export type SubtitleWord = z.infer<typeof subtitleWordSchema>;

// ── Video metadata ──────────────────────────────────────────────────────────

export const videoOriginalFormatSchema = z.object({
  codec: z.string().nullish(),
  audioCodec: z.string().nullish(),
  audioBitrate: z.number().nullish(),
  videoBitrate: z.number().nullish(),
  pixelFormat: z.string().nullish(),
  profile: z.string().nullish(),
  level: z.number().nullish(),
});

export const videoMetadataSchema = z.object({
  width: z.number(),
  height: z.number(),
  duration: z.union([z.string(), z.number()]).nullish(),
  fps: z.number().nullish(),
  codec: z.string().nullish(),
  bitrate: z.number().nullish(),
  rotation: z.string().nullish(),
  displayAspectRatio: z.string().nullish(),
  sampleAspectRatio: z.string().nullish(),
  originalFormat: videoOriginalFormatSchema.nullish(),
});

export type VideoMetadata = z.infer<typeof videoMetadataSchema>;

// Loose video-metadata variant used at the JSONB-column boundary. Modelled
// as `Record<string, unknown>` to match Drizzle's `.$type<Record<string,
// unknown>>()` declaration on `video_metadata`. Prefer the structured
// `videoMetadataSchema` in new code that controls the shape.
export const videoMetadataLooseSchema = z.record(z.string(), z.unknown());

// ── Style settings (canvas-style overrides per project) ─────────────────────

export const styleSettingsSchema = z
  .object({
    fontSize: z.number().nullish(),
    bottomOffset: z.number().nullish(),
    color: z.string().nullish(),
    outline: z.number().nullish(),
    shadow: z.number().nullish(),
  })
  .partial()
  .passthrough();

export type StyleSettings = z.infer<typeof styleSettingsSchema>;

// ── Text overlays (rendered via ASS) ────────────────────────────────────────

export const textOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['header', 'subheader', 'custom']),
  startTime: z.number(),
  endTime: z.number(),
  style: z.record(z.string(), z.unknown()).nullish(),
});

export type TextOverlay = z.infer<typeof textOverlaySchema>;

// ── Video segments (for trim/clip export) ───────────────────────────────────

export const videoSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  label: z.string().optional(),
});

export type VideoSegment = z.infer<typeof videoSegmentSchema>;

export const subtitleConfigSchema = z.object({
  stylePreference: z.string().optional(),
  heightPreference: z.string().optional(),
  locale: z.string().optional(),
  // `segments` is required so callers don't have to handle the
  // subtitle-without-segments edge case.
  segments: z.array(
    z.object({
      text: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      words: z.array(subtitleWordSchema).optional(),
    })
  ),
});

export type SubtitleConfig = z.infer<typeof subtitleConfigSchema>;

// ── Project row (DB shape, lower_snake_case to match Drizzle select) ────────

/**
 * Canonical shape for a subtitler project row coming out of Postgres.
 * Mirrors apps/api/database/schema/subtitler.ts. Most fields nullable on
 * the wire to tolerate older rows that predate later schema defaults.
 */
export const subtitlerProjectSchema = z.object({
  id: z.string(),
  user_id: z.string().nullish(),
  title: z.string().nullish(),
  status: z.string().nullish(),
  video_path: z.string().nullish(),
  video_filename: z.string().nullish(),
  video_size: z.number().nullish(),
  // JSONB columns — modelled as records to match Drizzle's `.$type<>`.
  video_metadata: videoMetadataLooseSchema.nullish(),
  thumbnail_path: z.string().nullish(),
  subtitled_video_path: z.string().nullish(),
  subtitles: z.string().nullish(),
  style_preference: z.string().nullish(),
  height_preference: z.string().nullish(),
  mode_preference: z.string().nullish(),
  style_settings: z.record(z.string(), z.unknown()).nullish(),
  created_at: z.union([z.string(), z.date()]).nullish(),
  updated_at: z.union([z.string(), z.date()]).nullish(),
  last_edited_at: z.union([z.string(), z.date()]).nullish(),
  export_count: z.number().nullish(),
});

export type SubtitlerProject = z.infer<typeof subtitlerProjectSchema>;

// ── Processing: cleanup ─────────────────────────────────────────────────────

export const cleanupBodySchema = z.object({});

export const cleanupResponseSchema = z.object({
  success: z.boolean(),
});

// ── Processing: process (start transcription) ───────────────────────────────

export const subtitlePreferenceSchema = z.enum(['manual', 'word']);
export const heightPreferenceSchema = z.enum(['standard', 'tief']);

export const processRequestSchema = z.object({
  uploadId: z.string(),
  subtitlePreference: subtitlePreferenceSchema.optional(),
  stylePreference: z.string().optional(),
  heightPreference: heightPreferenceSchema.optional(),
});

export type ProcessRequest = z.infer<typeof processRequestSchema>;

export const processStartResponseSchema = z.object({
  success: z.boolean().nullish(),
  status: z.literal('processing'),
  uploadId: z.string().nullish(),
});

// ── Processing: result query + response ─────────────────────────────────────

export const resultQuerySchema = z.object({
  subtitlePreference: z.string().optional(),
  stylePreference: z.string().optional(),
  heightPreference: z.string().optional(),
});

export type ResultQuery = z.infer<typeof resultQuerySchema>;

export const compressionStatusSchema = z.object({
  status: z.string(),
  progress: z.number().nullish(),
  compressedPath: z.string().nullish(),
});

export type CompressionStatus = z.infer<typeof compressionStatusSchema>;

/**
 * Result payload returned from GET /subtitler/result/:uploadId.
 * `subtitles` is `unknown` here because the Redis job result can contain
 * either a serialized SRT string or a structured segment array depending
 * on subtitlePreference. Callers narrow at use site.
 */
export const processResultResponseSchema = z.object({
  status: z.enum(['processing', 'complete', 'error', 'not_found', 'unknown']),
  subtitles: z.unknown().nullish(),
  compression: compressionStatusSchema.nullish(),
  error: z.string().nullish(),
});

// ── Processing: export (start render) ───────────────────────────────────────

export const exportRequestSchema = z.object({
  uploadId: z.string().optional(),
  // Either a structured segment array (preferred) or an SRT string.
  subtitles: z.union([z.array(z.record(z.string(), z.unknown())), z.string()]).optional(),
  subtitlePreference: z.string().optional(),
  stylePreference: z.string().optional(),
  heightPreference: z.string().optional(),
  locale: z.string().optional(),
  maxResolution: z.number().nullable().optional(),
  projectId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  // textOverlays uses `unknown` because the ASS-renderer's internal
  // TextOverlay shape (xPosition/yPosition) diverges from any wire shape
  // we'd express here. Validation happens in the ASS service.
  textOverlays: z.array(z.unknown()).optional(),
  fontSizeOverride: z.number().optional(),
  bottomOffsetOverride: z.number().optional(),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const exportStartResponseSchema = z.object({
  status: z.literal('exporting'),
  exportToken: z.string(),
});

// ── Processing: export-progress / export-download ───────────────────────────

/**
 * Shape written by the background export worker to Redis under
 * `export:${exportToken}` and read back by GET /export-progress and
 * GET /export-download. Also consumed by POST /share when promoting
 * an export to a share.
 */
export const exportProgressSchema = z.object({
  status: z.enum(['exporting', 'complete', 'error']),
  progress: z.number().nullish(),
  timeRemaining: z.union([z.string(), z.number()]).nullish(),
  message: z.string().nullish(),
  outputPath: z.string().nullish(),
  originalFilename: z.string().nullish(),
  projectId: z.string().nullish(),
  duration: z.number().nullish(),
  error: z.string().nullish(),
});

export type ExportProgress = z.infer<typeof exportProgressSchema>;

// ── Processing: export-segments ─────────────────────────────────────────────

export const exportSegmentsRequestSchema = z.object({
  uploadId: z.string().optional(),
  projectId: z.string().optional(),
  segments: z.array(videoSegmentSchema).min(1, 'Keine Segmente'),
  includeSubtitles: z.boolean().optional(),
  subtitleConfig: subtitleConfigSchema.optional(),
});

export type ExportSegmentsRequest = z.infer<typeof exportSegmentsRequestSchema>;

export const exportSegmentsResponseSchema = z.object({
  exportToken: z.string(),
  segmentCount: z.number().nullish(),
});

// ── Processing: process-auto / auto-progress ────────────────────────────────

export const autoProcessRequestSchema = z.object({
  uploadId: z.string(),
  locale: z.string().optional(),
  maxResolution: z.number().nullable().optional(),
  userId: z.string().nullable().optional(),
});

export type AutoProcessRequest = z.infer<typeof autoProcessRequestSchema>;

export const autoProcessStartResponseSchema = z.object({
  status: z.literal('processing'),
});

/**
 * Shape written under `auto:${uploadId}` Redis key by the auto-processing
 * pipeline. Read by GET /auto-progress and GET /auto-download.
 */
export const autoProgressSchema = z.object({
  status: z.enum(['processing', 'complete', 'error']),
  stage: z.number().nullish(),
  stageName: z.string().nullish(),
  stageProgress: z.number().nullish(),
  overallProgress: z.number().nullish(),
  outputPath: z.string().nullish(),
  duration: z.number().nullish(),
  projectId: z.string().nullish(),
  segments: z.array(subtitleSegmentSchema).nullish(),
  subtitles: z.string().nullish(),
  error: z.string().nullish(),
});

export type AutoProgress = z.infer<typeof autoProgressSchema>;

// ── Processing: Redis job result (transcription) ────────────────────────────

/**
 * Shape written under `job:${uploadId}:${prefs}` Redis key by the
 * transcription pipeline. The `data` field is loosely typed because the
 * success payload (subtitles) varies by mode and the error payload is a
 * string — narrowed at use site by the `status` discriminator.
 */
export const redisJobResultSchema = z.object({
  status: z.enum(['processing', 'complete', 'error']),
  data: z.unknown().nullish(),
});

export type RedisJobResult = z.infer<typeof redisJobResultSchema>;

// ── Processing: export-token ────────────────────────────────────────────────

export const exportTokenBodySchema = z.object({
  uploadId: z.string(),
  subtitles: z.string(),
  subtitlePreference: z.string().optional(),
  stylePreference: z.string().optional(),
  heightPreference: z.string().optional(),
});

export const exportTokenResponseSchema = z.object({
  success: z.boolean(),
  token: z.string().nullish(),
  downloadUrl: z.string().nullish(),
});

// ── Projects: request bodies ────────────────────────────────────────────────

export const projectDataBodySchema = z.object({
  uploadId: z.string().nullish(),
  videoFilename: z.string(),
  subtitles: z.array(subtitleSegmentSchema),
  title: z.string().nullish(),
  stylePreference: z.string().nullish(),
  heightPreference: z.string().nullish(),
  modePreference: z.string().nullish(),
  videoMetadata: videoMetadataLooseSchema.nullish(),
  videoSize: z.number().nullish(),
});

export type ProjectDataBody = z.infer<typeof projectDataBodySchema>;

export const updateProjectBodySchema = z.object({
  title: z.string().nullish(),
  subtitles: z.string().nullish(),
  style_preference: z.string().nullish(),
  stylePreference: z.string().nullish(),
  height_preference: z.string().nullish(),
  heightPreference: z.string().nullish(),
  style_settings: styleSettingsSchema.nullish(),
  styleSettings: styleSettingsSchema.nullish(),
  status: z.string().nullish(),
});

export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;

// ── Projects: response schemas ──────────────────────────────────────────────

/**
 * Project list item (subset of full project — no subtitles blob).
 */
export const projectItemSchema = subtitlerProjectSchema;

// Response envelopes carry structured `project` / `projects` shapes
// matching the Drizzle row exactly. No `.passthrough()` because that
// emits an index signature (`{[k:string]:unknown}`) that sealed return
// types like `SubtitlerProject` cannot satisfy — the contract validates
// the exact known columns and that's enough for ts-rest's runtime check
// + FE-side typed inference. Extra row fields from future migrations
// would need a corresponding schema update.
export const projectListResponseSchema = z.object({
  success: z.boolean(),
  projects: z.array(subtitlerProjectSchema),
});

export const projectSingleResponseSchema = z.object({
  success: z.boolean(),
  project: subtitlerProjectSchema,
});

export const projectCreateResponseSchema = z.object({
  success: z.boolean(),
  project: subtitlerProjectSchema,
  isNew: z.boolean().optional(),
});

export const projectUpdateResponseSchema = z.object({
  success: z.boolean(),
  project: subtitlerProjectSchema,
});

export const projectDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const projectExportTrackResponseSchema = z.object({
  success: z.boolean(),
});

// ── Share endpoints ─────────────────────────────────────────────────────────

export const createShareRequestSchema = z.object({
  exportToken: z.string(),
  title: z.string().optional(),
  projectId: z.string().optional(),
  expiresInDays: z.number().optional(),
});

export type CreateShareRequest = z.infer<typeof createShareRequestSchema>;

export const createShareFromProjectRequestSchema = z.object({
  projectId: z.string(),
  title: z.string().optional(),
  expiresInDays: z.number().optional(),
});

export type CreateShareFromProjectRequest = z.infer<typeof createShareFromProjectRequestSchema>;

export const shareInfoSchema = z.object({
  shareToken: z.string(),
  shareUrl: z.string(),
  expiresAt: z.union([z.string(), z.date()]),
  status: z.enum(['ready', 'rendering', 'failed']).nullish(),
});

export type ShareInfo = z.infer<typeof shareInfoSchema>;

export const subtitlerCreateShareResponseSchema = z.object({
  success: z.boolean(),
  share: shareInfoSchema.nullish(),
  error: z.string().nullish(),
  code: z.string().nullish(),
});

export const sharePublicSchema = z.object({
  title: z.string().nullish(),
  duration: z.number().nullish(),
  thumbnailUrl: z.string().nullish(),
  expiresAt: z.union([z.string(), z.date()]),
  downloadCount: z.number(),
  sharerName: z.string().nullish(),
  status: z.string(),
});

export const sharePublicResponseSchema = z.object({
  success: z.boolean(),
  share: sharePublicSchema.nullish(),
  error: z.string().nullish(),
});

// ── Social media ────────────────────────────────────────────────────────────

export const generateSocialRequestSchema = z.object({
  subtitles: z.string().min(1),
});

export type GenerateSocialRequest = z.infer<typeof generateSocialRequestSchema>;

export const generateSocialResponseSchema = z.object({
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

// ── Common error envelopes ──────────────────────────────────────────────────

export const subtitlerErrorResponseSchema = z.object({
  error: z.string(),
});

export const subtitlerSuccessErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.string(),
});

/**
 * Shape of an Axios error body coming from any subtitler endpoint. Used by
 * frontend stores instead of hand-rolled `AxiosErrorLike` interfaces.
 */
export const apiErrorBodySchema = z.object({
  error: z.string().nullish(),
  code: z.string().nullish(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
