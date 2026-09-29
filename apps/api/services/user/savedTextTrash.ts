/**
 * Papierkorb for gespeicherte Texte (`user_documents`, raw SQL — the table
 * has no Drizzle schema). Trash only sets `deleted_at`; the `user_texts`
 * vectors stay until the purge, and the search hydrates through Postgres
 * with the filter, so a trashed text is no hit meanwhile.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService.js';
import {
  deleteTrashedRow,
  isRowId,
  purgeSideStore,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

export const SAVED_TEXT_TRASH: OwnedTrashTable = {
  table: 'user_documents',
  columns: 'id, title',
};

/**
 * Move the caller's own texts to the Papierkorb; returns the ids actually
 * moved. Owner only — the check restore and purge-now ask too.
 */
export async function trashSavedTexts(userId: string, ids: string[]): Promise<string[]> {
  const valid = ids.filter(isRowId);
  if (valid.length === 0) return [];
  const rows = await getPostgresInstance().query<{ id: string }>(
    `UPDATE user_documents SET deleted_at = now()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
     RETURNING id`,
    [userId, valid]
  );
  return rows.map((r) => r.id);
}

/**
 * Hard-delete a trashed text (`user_document_metadata` cascades), then its
 * `user_texts` vectors. An unreachable Qdrant is skipped as the old delete did.
 */
export async function purgeSavedText(id: string, cutoff: Date | null): Promise<boolean> {
  if (!(await deleteTrashedRow(SAVED_TEXT_TRASH, id, cutoff))) return false;
  await purgeSideStore('user_document', id, 'qdrant', async () => {
    const qdrant = getQdrantInstance();
    if (!(await qdrant.isAvailable())) return;
    const result = await qdrant.deleteDocument(id, 'user_texts');
    if (!result.success) throw new Error('user_texts vectors could not be deleted');
  });
  return true;
}
