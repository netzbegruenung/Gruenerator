/**
 * Zod schemas for subtitler endpoints.
 * Mirrors apps/api/routes/subtitler/processingController.ts and
 * apps/api/routes/subtitler/projectController.ts.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production rule.
 *
 * ## SubtitleSegment canonicalization (2026-04-13)
 *
 * Before this session, `SubtitleSegment` was declared 9 different times
 * across apps/api/services/subtitler/*.ts — 8 agreed on
 * `{ startTime, endTime, text }`, 1 (`projectSavingService.ts`) had a
 * dual-shape widening accepting both `start/end` AND `startTime/endTime`
 * to paper over a frontend ↔ backend on-wire mismatch. Plus
 * `projectDataBodySchema.subtitles` was declared as
 * `z.array({ text, start, end })` (the wrong shape) AND the frontend
 * was sending `subtitles: srtString` which didn't match either shape,
 * resulting in silent 400s from validateBody and a pre-existing bug
 * where subtitle write through POST /subtitler/projects never worked.
 *
 * This file is now the single source of truth. Import `SubtitleSegment`
 * from `@gruenerator/contracts` everywhere; delete local duplicates.
 * Same unification pattern as UserProfile (N+1), GeneratedContent (N+4),
 * and SubtitleConfig (N+3).
 */
import { z } from 'zod';

// ── Canonical SubtitleSegment ───────────────────────────────────────────────

/**
 * Canonical subtitle segment shape. `startTime` / `endTime` are seconds
 * from video start; `text` is the displayed text for that segment.
 *
 * 8 of the 9 pre-unification declarations agreed on this shape exactly.
 * The 9th (projectSavingService) had a dual-shape widening accepting
 * both `start/end` and `startTime/endTime` — we keep the canonical
 * shape and migrate the outlier.
 */
export const subtitleSegmentSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

export type SubtitleSegment = z.infer<typeof subtitleSegmentSchema>;

// ── Processing: cleanup ─────────────────────────────────────────────────────

export const cleanupBodySchema = z.object({});

export const cleanupResponseSchema = z.object({
  success: z.boolean(),
});

// ── Processing: export-token ────────────────────────────────────────────────

export const exportTokenBodySchema = z.object({
  uploadId: z.string(),
  subtitles: z.string(),
  subtitlePreference: z.string().nullish(),
  stylePreference: z.string().nullish(),
  heightPreference: z.string().nullish(),
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
  // Canonical segment array — see `subtitleSegmentSchema` above.
  // Pre-unification this was `{ text, start, end }` which never matched
  // any of the 9 service-layer SubtitleSegment declarations. The 8
  // services that used `startTime/endTime` silently received the wrong
  // field names; the frontend happened to send an SRT string instead
  // and tripped validateBody with a "expected array, received string"
  // 400 from Session N+1 onward (logged but not user-visible because
  // the route was previously in the legacy router with silent 400s).
  subtitles: z.array(subtitleSegmentSchema),
  title: z.string().nullish(),
  stylePreference: z.string().nullish(),
  heightPreference: z.string().nullish(),
  modePreference: z.string().nullish(),
  videoMetadata: z.unknown().nullish(),
  videoSize: z.number().nullish(),
});

export const updateProjectBodySchema = z.object({
  title: z.string().nullish(),
  subtitles: z.string().nullish(),
  style_preference: z.string().nullish(),
  stylePreference: z.string().nullish(),
  height_preference: z.string().nullish(),
  heightPreference: z.string().nullish(),
  style_settings: z.unknown().nullish(),
  styleSettings: z.unknown().nullish(),
  status: z.string().nullish(),
});

// ── Projects: response schemas ──────────────────────────────────────────────

export const projectItemSchema = z.object({
  id: z.string(),
  user_id: z.string().nullish(),
  video_filename: z.string().nullish(),
  video_path: z.string().nullish(),
  title: z.string().nullish(),
  status: z.string().nullish(),
  thumbnail_path: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  export_count: z.number().nullish(),
  style_preference: z.string().nullish(),
  height_preference: z.string().nullish(),
  subtitles: z.unknown().nullish(),
  video_metadata: z.unknown().nullish(),
  video_size: z.number().nullish(),
});

export const projectListResponseSchema = z.object({
  success: z.boolean(),
  projects: z.unknown(),
});

export const projectSingleResponseSchema = z.object({
  success: z.boolean(),
  project: z.unknown(),
});

export const projectCreateResponseSchema = z.object({
  success: z.boolean(),
  project: z.unknown(),
  isNew: z.boolean().nullish(),
});

export const projectUpdateResponseSchema = z.object({
  success: z.boolean(),
  project: z.unknown(),
});

export const projectDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const projectExportTrackResponseSchema = z.object({
  success: z.boolean(),
});

export const subtitlerErrorResponseSchema = z.object({
  error: z.string(),
});

export const subtitlerSuccessErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.string(),
});
