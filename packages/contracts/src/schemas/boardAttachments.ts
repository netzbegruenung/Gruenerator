/**
 * Zod schemas for card file attachments (board cards).
 *
 * Files are stored on local disk (persistent `api-uploads` volume) and served by
 * a plain Express upload/download router; this contract covers the JSON
 * operations (list / delete / set-cover). Multipart upload is NOT contracted.
 */
import { z } from 'zod';

export const boardAttachmentRowSchema = z.object({
  id: z.string(),
  board_id: z.string(),
  card_id: z.string(),
  user_id: z.string(),
  file_name: z.string(),
  stored_filename: z.string(),
  mime_type: z.string().nullable(),
  // pg returns BIGINT as a string — coerce to number at the boundary.
  file_size: z.coerce.number(),
  is_cover: z.boolean(),
  created_at: z.string(),
  /** Public download URL (derived, not stored). */
  url: z.string(),
});
export type BoardAttachmentEntry = z.infer<typeof boardAttachmentRowSchema>;

export const attachmentListResponseSchema = z.array(boardAttachmentRowSchema);
export const attachmentSuccessResponseSchema = z.object({ success: z.literal(true) });
export const boardAttachmentErrorResponseSchema = z.object({ error: z.string() });
