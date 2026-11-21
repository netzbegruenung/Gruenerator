/**
 * Video editor projects (`/api/video-projects`): server-side documents in the
 * `collaborative_documents` pipeline (document_subtype = 'video').
 */
import { z } from 'zod';

export const videoAspectRatioSchema = z.enum(['16:9', '9:16', '1:1', '4:5']);

export type VideoAspectRatio = z.infer<typeof videoAspectRatioSchema>;

export const videoProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  aspect_ratio: videoAspectRatioSchema,
  created_at: z.string(),
  updated_at: z.string(),
  can_edit: z.boolean(),
});

export type VideoProject = z.infer<typeof videoProjectSchema>;

export const videoProjectListResponseSchema = z.array(videoProjectSchema);

/** Where a project was seeded from: `ki:<videoAiProjectId>:<version>`. */
export const videoProjectSourceRefSchema = z.string().regex(/^ki:[0-9a-f-]{36}:\d+$/);

export const createVideoProjectBodySchema = z.object({
  title: z.string().nullish(),
  aspect_ratio: videoAspectRatioSchema.nullish(),
  source_ref: videoProjectSourceRefSchema.nullish(),
});

export type CreateVideoProjectBody = z.infer<typeof createVideoProjectBodySchema>;

export const updateVideoProjectBodySchema = z.object({
  title: z.string().min(1).max(200).nullish(),
  aspect_ratio: videoAspectRatioSchema.nullish(),
});

export type UpdateVideoProjectBody = z.infer<typeof updateVideoProjectBodySchema>;

export const createVideoProjectResponseSchema = z.object({
  project: videoProjectSchema,
  created: z.boolean(),
});

export const deleteVideoProjectResponseSchema = z.object({ trashed: z.literal(true) });

export const videoProjectErrorResponseSchema = z.object({ error: z.string() });
