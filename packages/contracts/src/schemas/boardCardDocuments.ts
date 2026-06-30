/**
 * Zod schemas for agent-created documents linked to a board card
 * ("Grünerator-Dokumente").
 *
 * The board agent (@Grünerator) creates a document from a card comment and
 * records the link in the `board_card_documents` table — the reliable,
 * relational equivalent of board_attachments. This contract covers the JSON
 * operations (list / unlink). The manual "Dokumente"/Verknüpfen list (Yjs
 * `field-linked-docs`) is separate and not covered here.
 */
import { z } from 'zod';

export const boardCardDocumentRowSchema = z.object({
  id: z.string(),
  board_id: z.string(),
  card_id: z.string(),
  document_id: z.string(),
  title: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  /** Link to the document editor (derived, not stored). */
  url: z.string(),
});
export type BoardCardDocumentEntry = z.infer<typeof boardCardDocumentRowSchema>;

export const cardDocumentListResponseSchema = z.array(boardCardDocumentRowSchema);
export const cardDocumentSuccessResponseSchema = z.object({ success: z.literal(true) });
export const boardCardDocumentErrorResponseSchema = z.object({ error: z.string() });
