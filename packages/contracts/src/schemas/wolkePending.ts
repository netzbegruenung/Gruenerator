/**
 * Zod schemas for the Wolke folder watcher's pending-files endpoints.
 * Mirrors apps/api/routes/notebook/wolkePendingContractRouter.ts and the
 * `wolke_pending_files` Drizzle table (apps/api/database/schema/system.ts).
 *
 * The DTO is snake_case to match the rest of the notebook-collections contract;
 * the server router maps the camelCase Drizzle row to this shape.
 */
import { z } from 'zod';

/** Lifecycle of a detected file. Closed set → enum (no free strings). */
export const wolkePendingStatusSchema = z.enum(['pending', 'added', 'dismissed']);
export type WolkePendingStatus = z.infer<typeof wolkePendingStatusSchema>;

export const wolkePendingFileSchema = z.object({
  id: z.string(),
  collection_id: z.string(),
  share_link_id: z.string(),
  folder_path: z.string(),
  file_path: z.string(),
  file_name: z.string(),
  etag: z.string().nullable(),
  size: z.number().nullable(),
  mime_type: z.string().nullable(),
  status: wolkePendingStatusSchema,
  detected_at: z.string(),
  resolved_at: z.string().nullable(),
});
export type WolkePendingFileDto = z.infer<typeof wolkePendingFileSchema>;

export const listPendingFilesResponseSchema = z.object({
  pending: z.array(wolkePendingFileSchema),
});
export type ListPendingFilesResponse = z.infer<typeof listPendingFilesResponseSchema>;

export const addPendingFileResponseSchema = z.object({
  success: z.boolean(),
  document_id: z.string(),
  pending: wolkePendingFileSchema,
});
export type AddPendingFileResponse = z.infer<typeof addPendingFileResponseSchema>;

export const dismissPendingFileResponseSchema = z.object({
  success: z.boolean(),
  pending: wolkePendingFileSchema,
});
export type DismissPendingFileResponse = z.infer<typeof dismissPendingFileResponseSchema>;

/** Toggle hourly watching for a notebook (sets the collection's auto_sync flag). */
export const setNotebookAutoSyncBodySchema = z.object({
  enabled: z.boolean(),
});
export type SetNotebookAutoSyncBody = z.infer<typeof setNotebookAutoSyncBodySchema>;

export const setNotebookAutoSyncResponseSchema = z.object({
  success: z.boolean(),
  auto_sync: z.boolean(),
});
export type SetNotebookAutoSyncResponse = z.infer<typeof setNotebookAutoSyncResponseSchema>;
