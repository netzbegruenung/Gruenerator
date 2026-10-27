/**
 * Authorization for document ids a chat request names in its body
 * (`documentIds` from @datei picks, `documentChatIds` from document chat).
 *
 * Those ids scope the document search, and a scoped search deliberately runs
 * WITHOUT a `user_id` filter (`searchOperations.ts`) — a shared notebook holds
 * other people's documents. That makes this the trust boundary: an id that
 * passes here is searched as-is.
 *
 * A document is readable when the user owns it, or when it is linked to a
 * notebook the user may read — checked with the same rule every other
 * notebook-source read uses (`resolveSourceInNotebook`). The notebook is looked
 * up from the document rather than taken from the request: the @datei picker
 * offers sources of notebooks shared via a Projekt, and shipped mobile builds
 * send only the bare document id.
 */
import { type NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { type PostgresService } from '../../../database/services/PostgresService.js';
import { resolveSourceInNotebook } from '../../../services/notebook/notebookSources.js';
import { createLogger } from '../../../utils/logger.js';
import { type NotebookAccess } from '../../notebook/notebookAccess.js';

const log = createLogger('DocumentScopeAccess');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DocumentScopeAccessDeps {
  db: Pick<PostgresService, 'query'>;
  helper: Pick<
    NotebookQdrantHelper,
    | 'getCollectionIdsForDocuments'
    // The rest is what `resolveSourceInNotebook` takes.
    | 'getCollectionDocuments'
    | 'isDocumentInCollection'
    | 'getNotebookCollection'
  >;
  access: (notebookId: string, userId: string) => Promise<NotebookAccess>;
}

export interface AuthorizedDocumentScope {
  /** The readable ids, in request order, without duplicates. */
  documentIds: string[];
  /** For documents readable only through a notebook: the notebook that grants it. */
  documentNotebookIds: Record<string, string>;
}

async function defaultDeps(): Promise<DocumentScopeAccessDeps> {
  const [{ getPostgresInstance }, { NotebookQdrantHelper }, { checkNotebookAccess }] =
    await Promise.all([
      import('../../../database/services/PostgresService.js'),
      import('../../../database/services/NotebookQdrantHelper.js'),
      import('../../notebook/notebookAccess.js'),
    ]);
  return {
    db: getPostgresInstance(),
    helper: new NotebookQdrantHelper(),
    access: checkNotebookAccess,
  };
}

/** Drops every id the user may not read; never throws for an unreadable id. */
export async function authorizeDocumentScope(
  userId: string,
  requestedIds: readonly string[],
  deps?: DocumentScopeAccessDeps
): Promise<AuthorizedDocumentScope> {
  const ids = [...new Set(requestedIds)];
  if (ids.length === 0) return { documentIds: [], documentNotebookIds: {} };

  // Not a UUID → not a `documents` row; keeps the `uuid[]` cast below safe.
  const candidates = ids.filter((id) => UUID_RE.test(id));
  const allowed = new Set<string>();
  const documentNotebookIds: Record<string, string> = {};

  if (candidates.length > 0) {
    try {
      const d = deps ?? (await defaultDeps());
      const rows = await d.db.query<{ id: string; user_id: string | null }>(
        'SELECT id, user_id FROM documents WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
        [candidates]
      );
      const foreign: string[] = [];
      for (const row of rows) {
        if (!row.user_id) continue;
        if (row.user_id === userId) allowed.add(row.id);
        else foreign.push(row.id);
      }

      if (foreign.length > 0) {
        // One access check per notebook, however many requested documents it holds.
        const accessCache = new Map<string, Promise<NotebookAccess>>();
        const access = (notebookId: string, uid: string): Promise<NotebookAccess> => {
          let hit = accessCache.get(notebookId);
          if (!hit) {
            hit = d.access(notebookId, uid);
            accessCache.set(notebookId, hit);
          }
          return hit;
        };
        const notebooksByDocument = await d.helper.getCollectionIdsForDocuments(foreign);
        for (const documentId of foreign) {
          for (const collectionId of notebooksByDocument.get(documentId) ?? []) {
            const source = await resolveSourceInNotebook(
              { collectionId, sourceId: documentId, userId },
              { db: d.db, helper: d.helper, access }
            );
            if (source.ok) {
              allowed.add(documentId);
              documentNotebookIds[documentId] = collectionId;
              break;
            }
          }
        }
      }
    } catch (err) {
      // Fail closed: a lookup error must not widen what the search may read.
      // Ids authorized before the error stay; the rest are dropped below.
      log.warn(
        `[DocumentScopeAccess] Authorization lookup failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const documentIds = ids.filter((id) => allowed.has(id));
  if (documentIds.length < ids.length) {
    log.warn(
      `[DocumentScopeAccess] Dropped ${ids.length - documentIds.length} of ${ids.length} document id(s) the user cannot read`
    );
  }
  return { documentIds, documentNotebookIds };
}
