/**
 * Zod schemas for chat thread folders (OpenWebUI-style thread grouping).
 * Consumed by chatThreadFoldersContract + its ts-rest router.
 */
import { z } from 'zod';

export const chatThreadFolderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  sort: z.number(),
  createdAt: z.string(), // ISO date string over the wire
});

// ── Request bodies ──────────────────────────────────────────────────────────

export const createFolderBodySchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

export const updateFolderBodySchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  sort: z.number().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const folderListResponseSchema = z.array(chatThreadFolderSchema);
export const folderResponseSchema = chatThreadFolderSchema;

export const errorResponseSchema = z.object({ error: z.string() });
export const successResponseSchema = z.object({ success: z.literal(true) });

export type ChatThreadFolderDto = z.infer<typeof chatThreadFolderSchema>;
