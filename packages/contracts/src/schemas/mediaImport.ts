import { z } from 'zod';

/**
 * A finished resumable upload (tus on `/api/uploads`) becomes a Mediathek item.
 * `uploadId` is the last path segment of the tus upload URL.
 */
export const importMediaUploadBodySchema = z.object({
  uploadId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  title: z.string().trim().max(200).nullish(),
});
export type ImportMediaUploadBody = z.infer<typeof importMediaUploadBodySchema>;

export const importMediaUploadResponseSchema = z.object({
  mediaId: z.string().guid(),
  shareToken: z.string(),
  /** Relative, like every other Mediathek upload response: `/share/<token>`. */
  shareUrl: z.string(),
  mediaType: z.enum(['video', 'audio']),
  title: z.string(),
  durationSeconds: z.number(),
});
export type ImportMediaUploadResponse = z.infer<typeof importMediaUploadResponseSchema>;

export const mediaImportErrorSchema = z.object({ error: z.string() });
