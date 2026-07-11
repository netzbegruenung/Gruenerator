/**
 * Output: create a standalone document from the AI result and return its url/id so
 * the comment/email nodes can reference it. Reuses the same document-creation path
 * as the legacy agent worker. The document inherits the board's sharing (so the whole
 * group can open it) and is recorded in the card's "Grünerator-Dokumente" list via a
 * reliable Postgres write (board_card_documents) — works whether or not anyone has
 * the board open.
 */
import { createDocumentWithContent } from '../../../docs/DocGenerationService.js';
import { inheritBoardSharingToDocument } from '../../boardSharingService.js';
import { linkAgentDocumentToCard } from '../../cardDocumentService.js';

import { type OutputExecutor } from './types.js';

export const documentOutput: OutputExecutor = async (ctx) => {
  const doc = await createDocumentWithContent(
    ctx.title,
    ctx.content,
    'blank',
    ctx.task.requested_by
  );

  // Best-effort (both log and swallow): share with the board's members and link the
  // doc into the originating card's Grünerator-Dokumente list.
  await inheritBoardSharingToDocument(doc.id, ctx.task.board_id);
  await linkAgentDocumentToCard(
    ctx.task.board_id,
    ctx.task.card_id,
    doc.id,
    ctx.title,
    ctx.task.requested_by
  );

  return { documentUrl: `/office/${doc.id}`, documentId: doc.id };
};
