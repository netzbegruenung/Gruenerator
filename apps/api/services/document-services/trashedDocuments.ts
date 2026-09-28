/**
 * Qdrant hits against the Papierkorb.
 *
 * A trashed document keeps its chunks in Qdrant (restore needs no re-embed),
 * so every search over the `documents` collection hydrates its hits against
 * Postgres and drops the trashed ones. The question is asked the other way
 * round — "which of these rows are trashed?" — because many chunk ids have no
 * `documents` row at all (embedded chat attachments), and those must survive.
 * Correct even when Qdrant was unreachable at trash time.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids among `ids` whose `documents` row is in the Papierkorb. */
export async function trashedDocumentIds(ids: readonly string[]): Promise<Set<string>> {
  const candidates = [...new Set(ids)].filter((id) => UUID_RE.test(id));
  if (candidates.length === 0) return new Set();
  const rows = await getPostgresInstance().query<{ id: string }>(
    'SELECT id FROM documents WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL',
    [candidates]
  );
  return new Set(rows.map((row) => String(row.id)));
}

/** `ids` without the trashed ones, order kept. */
export async function withoutTrashedDocuments(ids: readonly string[]): Promise<string[]> {
  const trashed = await trashedDocumentIds(ids);
  return trashed.size === 0 ? [...ids] : ids.filter((id) => !trashed.has(id));
}
