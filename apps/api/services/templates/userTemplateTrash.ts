/**
 * Papierkorb for Vorlagen (`user_templates`). Trash only sets `deleted_at`:
 * the Qdrant point and a Grünerator-Vorlage's snapshot canvas stay until the
 * purge, which runs what the DELETE handler used to do.
 */
import { type UserTemplate } from '../../database/schema/templates.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { deleteLikesForEntity } from '../entityLikes/EntityLikesService.js';
import {
  deleteTrashedRow,
  isRowId,
  purgeSideStore,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

import { purgeGrueneratorSnapshot } from './grueneratorVorlage.js';
import { deleteTemplateVector } from './templateEnrichment.js';

export const USER_TEMPLATE_TRASH: OwnedTrashTable = {
  table: 'user_templates',
  columns: 'id, title',
};

/**
 * Move the caller's own Vorlagen to the Papierkorb; returns the ids actually
 * moved. Owner only (`user_id`, `type = 'template'`) — the check restore and
 * purge-now ask too.
 */
export async function trashUserTemplates(userId: string, ids: string[]): Promise<string[]> {
  const valid = ids.filter(isRowId);
  if (valid.length === 0) return [];
  const rows = await getPostgresInstance().query<{ id: string }>(
    `UPDATE user_templates SET deleted_at = now()
     WHERE user_id = $1 AND type = 'template' AND id = ANY($2::uuid[]) AND deleted_at IS NULL
     RETURNING id`,
    [userId, valid]
  );
  return rows.map((r) => r.id);
}

/**
 * Hard-delete a trashed Vorlage, then its Qdrant point, snapshot canvas and
 * likes (`entity_likes` is polymorphic, no FK cascades them).
 */
export async function purgeUserTemplate(id: string, cutoff: Date | null): Promise<boolean> {
  const row = await deleteTrashedRow<
    Pick<UserTemplate, 'id' | 'user_id' | 'template_type' | 'content_data'>
  >(USER_TEMPLATE_TRASH, id, cutoff, 'id, user_id, template_type, content_data');
  if (!row) return false;

  await purgeSideStore('user_template', id, 'qdrant', () => deleteTemplateVector(id));
  await purgeSideStore('user_template', id, 'snapshot_canvas', () =>
    purgeGrueneratorSnapshot(row.template_type, row.content_data, row.user_id)
  );
  await purgeSideStore('user_template', id, 'entity_likes', () =>
    deleteLikesForEntity('template', id)
  );
  return true;
}
