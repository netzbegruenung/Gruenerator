/**
 * Zod schemas for subtitler endpoints.
 * Mirrors apps/api/routes/subtitler/processingController.ts and
 * apps/api/routes/subtitler/projectController.ts.
 *
 * IMPORTANT: Request bodies use `.nullish()` for optional fields per the
 * 2026-04-12 production rule.
 */
import { z } from 'zod';

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
  subtitles: z.array(
    z.object({
      text: z.string(),
      start: z.number(),
      end: z.number(),
    })
  ),
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
