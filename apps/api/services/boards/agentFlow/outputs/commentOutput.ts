/**
 * Output: post the AI result as a Grünerator-bot comment on the card. When a
 * document node also ran, the comment links to the document (relative URL, so it's
 * clickable in-app) instead of dumping the full text — the document is also
 * verknüpft in the card's "Dokumente" section by the document node.
 */
import { postBotComment } from '../../agentTaskService.js';

import { type OutputExecutor } from './types.js';

export const commentOutput: OutputExecutor = async (ctx) => {
  const { task } = ctx;
  const blocks = ctx.documentUrl
    ? [
        {
          type: 'text' as const,
          text: '✅ Fertig! Dokument erstellt und mit der Karte verknüpft: ',
        },
        { type: 'link' as const, text: ctx.title, url: ctx.documentUrl },
      ]
    : [{ type: 'text' as const, text: ctx.content }];

  await postBotComment({
    boardId: task.board_id,
    cardId: task.card_id,
    parentId: task.trigger_comment_id,
    blocks,
  });
};
