/**
 * What account deletion removes before the profile row goes. No FK cascade
 * reaches any of it: `collaborative_documents.created_by` is SET NULL,
 * notebooks live in Qdrant, and `entity_likes` has no FK at all. Account
 * deletion stays hard — nothing here goes through the Papierkorb.
 *
 * Every step is best-effort: a failure is reported and the rest goes on, so
 * one broken item cannot block deleting the account.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { purgeSoleOwnedCollaborativeDocuments } from '../docs/CollaborativeDocumentService.js';
import {
  deleteLikesForEntity,
  deleteLikesOfDeletedUser,
} from '../entityLikes/EntityLikesService.js';

const log = createLogger('accountDeletion');

export async function cleanUpBeforeProfileDelete(userId: string): Promise<void> {
  const postgres = getPostgresInstance();
  const docs = await purgeSoleOwnedCollaborativeDocuments(
    (sql, params) => postgres.query(sql, params),
    userId
  );

  let notebooks = 0;
  try {
    const helper = new NotebookQdrantHelper();
    for (const id of await helper.listAllNotebookIdsOfUser(userId)) {
      try {
        await helper.deleteNotebookCollection(id);
        await deleteLikesForEntity('notebook', id);
        notebooks++;
      } catch (error) {
        reportBackgroundError(error, { job: 'account-deletion', kind: 'notebook', id });
      }
    }
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: 'notebook_collections' });
  }

  try {
    await deleteLikesOfDeletedUser(userId);
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: 'entity_likes' });
  }

  log.info(`Removed ${docs} sole-owned documents and ${notebooks} notebooks of ${userId}`);
}
