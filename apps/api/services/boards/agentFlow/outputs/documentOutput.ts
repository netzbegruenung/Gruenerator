/**
 * Output: create a standalone document from the AI result and return its url/id so
 * the comment/email nodes can reference it. Reuses the same document-creation path
 * as the legacy agent worker. The document is linked into the card's "Dokumente"
 * section client-side (see useAgentRun) so it goes through the live Yjs session,
 * just like a manual link — the server can't write into the live board doc.
 */
import { createDocumentWithContent } from '../../../docs/DocGenerationService.js';

import { type OutputExecutor } from './types.js';

export const documentOutput: OutputExecutor = async (ctx) => {
  const doc = await createDocumentWithContent(
    ctx.title,
    ctx.content,
    'blank',
    ctx.task.requested_by
  );
  return { documentUrl: `/docs/${doc.id}`, documentId: doc.id };
};
