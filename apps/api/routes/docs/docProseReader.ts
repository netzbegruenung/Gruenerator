/**
 * Server-side reader for the prose body of a BlockNote collaborative document
 * (docs subtypes). Reads the authoritative Yjs state as plain text. Access is
 * enforced with the same owned/shared/group predicate as the docs list, so a
 * user can only read their own (or shared) documents.
 *
 * Sheets/presentations/boards have their own richer readers
 * (loadSheetState/loadPresentationState/loadBoardState + formatters); this
 * covers the prose docs that have no structured loader.
 */

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getDocumentHtml } from '../../services/docs/docContentService.js';
import { createLogger } from '../../utils/logger.js';

import { docsAccessWhere } from './constants.js';

const log = createLogger('DocProseReader');

function stripTags(html: string): string {
  let text = html;
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(/<[^>]+>/g, '');
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Read the plain-text prose of a document the user may access. Returns null if
 * the document is not visible to the user, has no snapshot, or fails to decode.
 */
export async function loadDocumentProse(docId: string, userId: string): Promise<string | null> {
  const db = getPostgresInstance();

  // Access gate — reuse the canonical docs visibility predicate. Any subtype is
  // allowed here; callers pass ids they already surfaced via office search.
  const access = (await db.query(
    `SELECT cd.id FROM collaborative_documents cd
     WHERE cd.id = $2::uuid AND ${docsAccessWhere('$3', '$1')}`,
    [
      userId,
      docId,
      [
        'blank',
        'docs',
        'antrag',
        'pressemitteilung',
        'protokoll',
        'notizen',
        'redaktionsplan',
        'checkliste',
        'einladung',
        'tabelle',
      ],
    ]
  )) as Array<{ id: string }>;
  if (access.length === 0) return null;

  try {
    // Snapshots alone are two kinds of stale: they are written at most every 5
    // minutes (so the newest edits live in `yjs_document_updates`), and a
    // document created server-side and never opened has none at all — it only
    // has `collaborative_documents_init`. `getDocumentHtml` walks the same
    // three tiers the editor does, live doc first.
    const { html } = await getDocumentHtml(docId);
    const text = stripTags(html);
    return text.length > 0 ? text : null;
  } catch (err) {
    log.warn(`[DocProse] Failed to decode document ${docId}: ${err}`);
    return null;
  }
}
