/**
 * Output: turn the (already-researched) AI result into a spreadsheet (subtype
 * 'sheets') and link it into the card. `ctx.content` is researched prose from the
 * flow's AI step; `createSheetFromText` structures it into a Univer workbook via
 * the shared chat-loop generator. Shares the board's sharing and records the doc
 * in the card's "Grünerator-Dokumente" list, like documentOutput.
 */
import { inheritBoardSharingToDocument } from '../../boardSharingService.js';
import { linkAgentDocumentToCard } from '../../cardDocumentService.js';
import { createSheetFromText } from '../artifactGen.js';

import { type OutputExecutor } from './types.js';

export const sheetOutput: OutputExecutor = async (ctx) => {
  const source = ctx.cardContext.title
    ? `${ctx.content}\n\n---\nKarten-Kontext: ${ctx.cardContext.title}`
    : ctx.content;

  const artifact = await createSheetFromText(source, ctx.task.requested_by);
  if (!artifact) return;

  await inheritBoardSharingToDocument(artifact.id, ctx.task.board_id);
  await linkAgentDocumentToCard(
    ctx.task.board_id,
    ctx.task.card_id,
    artifact.id,
    artifact.title,
    ctx.task.requested_by
  );

  return { documentUrl: artifact.url, documentId: artifact.id };
};
