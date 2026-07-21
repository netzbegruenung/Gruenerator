/**
 * Output: turn the (already-researched) AI result into a presentation (subtype
 * 'presentations') and link it into the card. `ctx.content` is researched prose
 * from the flow's AI step; `createPresentationFromText` structures it into reveal
 * slides via the shared chat-loop generator. Shares the board's sharing and
 * records the doc in the card's "Grünerator-Dokumente" list, like documentOutput.
 */
import { inheritBoardSharingToDocument } from '../../boardSharingService.js';
import { linkAgentDocumentToCard } from '../../cardDocumentService.js';
import { createPresentationFromText } from '../artifactGen.js';

import { type OutputExecutor } from './types.js';

export const presentationOutput: OutputExecutor = async (ctx) => {
  const source = ctx.cardContext.title
    ? `${ctx.content}\n\n---\nKarten-Kontext: ${ctx.cardContext.title}`
    : ctx.content;

  const artifact = await createPresentationFromText(source, ctx.task.requested_by);
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
