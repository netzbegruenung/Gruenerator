/**
 * Zod schemas for the Papierkorb (`/api/trash`).
 *
 * `trashKindSchema` is F0 as soon as it ships: all 16 values exist from day
 * one, even while the server has handlers for only some of them — a kind
 * without a handler answers 404, an unknown kind 400.
 */
import { z } from 'zod';

export const trashKindSchema = z.enum([
  'collaborative_document',
  'chat_thread',
  'notebook',
  'document',
  'shared_media',
  'subtitler_project',
  'user_agent',
  'user_template',
  'user_text_form',
  'custom_prompt',
  'user_site',
  'recurring_task',
  'user_letterhead',
  'user_document',
  'user_knowledge',
  'group',
]);
export type TrashKind = z.infer<typeof trashKindSchema>;

export const trashItemSchema = z.object({
  kind: trashKindSchema,
  id: z.string(),
  title: z.string(),
  /** document_subtype / media_type / … — display only. */
  subtype: z.string().nullable(),
  deletedAt: z.string(),
  /** Computed on the server; the client never knows the retention period. */
  purgeAt: z.string(),
});
export type TrashItem = z.infer<typeof trashItemSchema>;

export const trashListQuerySchema = z.object({
  kind: trashKindSchema.optional(),
  /** Opaque keyset token from `nextCursor`. */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const trashListResponseSchema = z.object({
  items: z.array(trashItemSchema),
  /** Null on the last page. */
  nextCursor: z.string().nullable(),
});
export type TrashListResponse = z.infer<typeof trashListResponseSchema>;

export const trashItemParamsSchema = z.object({
  kind: trashKindSchema,
  id: z.string().min(1),
});

export const trashEmptyQuerySchema = z.object({
  kind: trashKindSchema.optional(),
});

export const trashPurgeResponseSchema = z.object({
  purged: z.number().int(),
});
export type TrashPurgeResponse = z.infer<typeof trashPurgeResponseSchema>;

export const trashErrorSchema = z.object({
  error: z.string(),
});
