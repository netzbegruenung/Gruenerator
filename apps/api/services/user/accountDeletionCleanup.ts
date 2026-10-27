/**
 * What account deletion removes before the profile row goes. No FK cascade
 * reaches any of it: `collaborative_documents.created_by` is SET NULL,
 * notebooks live in Qdrant, `entity_likes` and `entity_comments` have no FK to
 * the item at all, `user_agents` and `user_text_forms` have no FK to the
 * profile (#4723), and the OAuth
 * tokens of connected accounts (Microsoft, Google, …) live in Nango, and a
 * Canva grant stays valid at Canva until it is revoked. Account
 * deletion stays hard — nothing here goes through the Papierkorb.
 *
 * Every step is best-effort: a failure is reported and the rest goes on, so
 * one broken item cannot block deleting the account.
 */
import { env } from '../../config/env.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { CanvaConnectionManager } from '../connections/canva/CanvaConnectionManager.js';
import { ConnectionService } from '../connections/ConnectionService.js';
import { purgeSoleOwnedCollaborativeDocuments } from '../docs/CollaborativeDocumentService.js';
import {
  deleteCommentsForEntity,
  deleteCommentsOnItemsOfDeletedUser,
} from '../entityComments/entityCommentsCleanup.js';
import {
  deleteFavoritesForEntity,
  deleteFavoritesOfDeletedUser,
} from '../entityFavorites/EntityFavoritesService.js';
import {
  deleteLikesForEntity,
  deleteLikesOfDeletedUser,
} from '../entityLikes/EntityLikesService.js';
import { type OwnedTrashTable, trashAllOwnedRowsOfDeletedUser } from '../trash/ownedRowTrash.js';
import { purgeUserAgent, USER_AGENT_TRASH } from '../userAgents/userAgentsRepository.js';

import { purgeTextForm, TEXT_FORM_TRASH } from './textFormRepository.js';

const log = createLogger('accountDeletion');

/**
 * Every row of the person, trashed ones included, through the kind's purge —
 * so likes, comments and item reactions go with it. Returns how many went.
 */
async function purgeAllOwnedRows(
  t: OwnedTrashTable,
  userId: string,
  purge: (id: string, cutoff: Date | null) => Promise<boolean>
): Promise<number> {
  let purged = 0;
  try {
    for (const id of await trashAllOwnedRowsOfDeletedUser(t, userId)) {
      try {
        if (await purge(id, null)) purged++;
      } catch (error) {
        reportBackgroundError(error, { job: 'account-deletion', kind: t.table, id });
      }
    }
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: t.table });
  }
  return purged;
}

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
        // Notebooks are not in Postgres, so the item sweeps below cannot see them.
        await deleteCommentsForEntity('notebook', id);
        await deleteFavoritesForEntity('notebook', id);
        notebooks++;
      } catch (error) {
        reportBackgroundError(error, { job: 'account-deletion', kind: 'notebook', id });
      }
    }
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: 'notebook_collections' });
  }

  const agents = await purgeAllOwnedRows(USER_AGENT_TRASH, userId, purgeUserAgent);
  const recipes = await purgeAllOwnedRows(TEXT_FORM_TRASH, userId, purgeTextForm);

  try {
    await deleteLikesOfDeletedUser(userId);
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: 'entity_likes' });
  }

  try {
    await deleteCommentsOnItemsOfDeletedUser(userId);
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: 'entity_comments' });
  }

  try {
    await deleteFavoritesOfDeletedUser(userId);
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: 'entity_favorites' });
  }

  let connections = 0;
  if (env.NANGO_SECRET_KEY) {
    try {
      connections = await ConnectionService.deleteAllConnections(userId);
    } catch (error) {
      reportBackgroundError(error, { job: 'account-deletion', store: 'nango' });
    }
  }

  // The profile row (and the stored tokens with it) goes anyway; this revokes
  // the grant at Canva, so the refresh token stops working there too.
  try {
    await CanvaConnectionManager.disconnect(userId);
  } catch (error) {
    reportBackgroundError(error, { job: 'account-deletion', store: 'canva' });
  }

  log.info(
    `Removed ${docs} sole-owned documents, ${notebooks} notebooks, ${agents} agents, ${recipes} recipes and ${connections} connections of ${userId}`
  );
}
