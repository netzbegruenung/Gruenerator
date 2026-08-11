import { promisify } from 'util';
import { gzip } from 'zlib';

import { DOCUMENT_FRAGMENT_NAME, injectHtmlIntoFragment } from '@gruenerator/shared/yjs';
import * as Y from 'yjs';

import { collaborative_documents_init } from '../../database/schema/collaborative.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';

const gzipAsync = promisify(gzip);
const log = createLogger('seedYjsState');

/**
 * Seeds `collaborative_documents_init` with a gzipped Y.Doc built from `html`.
 * Idempotent via ON CONFLICT DO NOTHING. Returns true iff a new row was written.
 *
 * Yjs is canonical for collaborative docs. This seed lets the first connection
 * to Hocuspocus hydrate the editor from authoritative state instead of falling
 * back to the legacy `content`-as-HTML bootstrap path (which silently produced
 * empty docs whenever `content` wasn't a parseable HTML subset).
 *
 * Throws on DB error — use `seedYjsStateSafe` from request handlers.
 */
export async function seedYjsState(documentId: string, html: string): Promise<boolean> {
  if (!html?.trim()) return false;

  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
  injectHtmlIntoFragment(fragment, html);
  if (fragment.length === 0) return false;

  const compressed = await gzipAsync(Y.encodeStateAsUpdate(ydoc));
  const rows = await getDrizzleInstance()
    .insert(collaborative_documents_init)
    .values({ document_id: documentId, init_data: compressed })
    .onConflictDoNothing()
    .returning({ document_id: collaborative_documents_init.document_id });

  return rows.length > 0;
}

/**
 * Overwrite `collaborative_documents_init` with a Y.Doc built from `html`.
 *
 * Only ever correct for a document with NO snapshot and NO update rows: those
 * two tiers are checked first when the editor hydrates, so an init row under
 * them is dead weight. `docContentService.replaceDocumentHtml` owns that
 * precondition — do not call this without it.
 *
 * Returns false when the html parsed to nothing (the caller must then treat the
 * write as failed rather than leave the old state in place and report success).
 */
export async function writeYjsInitState(documentId: string, html: string): Promise<boolean> {
  if (!html?.trim()) return false;

  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment(DOCUMENT_FRAGMENT_NAME);
  injectHtmlIntoFragment(fragment, html);
  if (fragment.length === 0) return false;

  const compressed = await gzipAsync(Y.encodeStateAsUpdate(ydoc));
  await getDrizzleInstance()
    .insert(collaborative_documents_init)
    .values({ document_id: documentId, init_data: compressed })
    .onConflictDoUpdate({
      target: collaborative_documents_init.document_id,
      set: { init_data: compressed },
    });

  return true;
}

/**
 * Best-effort version of `seedYjsState` for request handlers. Logs failures
 * with `context` and never throws — seed failure should not block doc creation
 * because the Phase-6 plaintext fallback in hocuspocus still produces a usable
 * editor for unseeded docs.
 */
export async function seedYjsStateSafe(
  documentId: string,
  html: string,
  context: string
): Promise<void> {
  try {
    await seedYjsState(documentId, html);
  } catch (err) {
    log.warn(
      `[${context}] Failed to seed Yjs state for ${documentId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
