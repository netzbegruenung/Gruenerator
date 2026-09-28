/**
 * Projekte im Papierkorb. Löschen setzt nur `groups.deleted_at`: Mitgliedschaften,
 * Beiträge, Freigaben und Anweisungen bleiben stehen, jeder Leser von `groups`
 * blendet das Projekt aber aus (`trashReaders.vitest.ts`). Wiederherstellen ist
 * deshalb vollständig. Erst `purgeGroup` löscht hart — der frühere Körper von
 * `DELETE /api/groups/:groupId` — samt Beitragsdateien und Avatar.
 *
 * Rechte für Löschen, Wiederherstellen und endgültiges Löschen sind dieselben:
 * Ersteller*in oder Admin-Mitglied; das System-Projekt nie. Geprüft wird direkt
 * gegen `groups`/`group_memberships` und nicht über
 * `getPostgresAndCheckMembership`, das getrashte Projekte gar nicht mehr sieht.
 */
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { sql } from 'drizzle-orm';

import { type GroupPostFileRow, type GroupRow } from '../../database/schema/groups.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { notifyGroupMembers } from '../notifications/index.js';
import {
  isRowId,
  isUniqueViolation,
  purgeSideStore,
  type OwnedRestoreResult,
} from '../trash/ownedRowTrash.js';
import { type TrashCursor, trashKeysetWhere, trashOrderBy } from '../trash/trashCursor.js';

import { deleteGroupPostFile } from './groupPosts.js';

const log = createLogger('groupTrash');

export const GROUP_AVATAR_DIR = path.join(
  dirname(fileURLToPath(import.meta.url)),
  '../../uploads/group-avatars'
);

export type GroupTrashResult = 'ok' | 'not_found' | 'forbidden' | 'system';

export type TrashedGroup = Pick<GroupRow, 'id' | 'name' | 'group_type'> & { deleted_at: Date };

type GroupRights = Pick<GroupRow, 'created_by' | 'is_system'>;

/** Ersteller*in oder Admin-Mitglied — dieselbe Regel wie beim Löschen. */
async function mayDelete(group: GroupRights, groupId: string, userId: string): Promise<boolean> {
  if (group.is_system) return false;
  if (group.created_by === userId) return true;
  const membership = (await getPostgresInstance().queryOne(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
    { table: 'group_memberships' }
  )) as { role: string } | null;
  return membership?.role === 'admin';
}

/**
 * Das Projekt in den Papierkorb. Die Mitglieder werden wie bisher benachrichtigt
 * — aus ihrer Sicht ist es aufgelöst, sie verlieren den Zugriff sofort.
 */
export async function trashGroup(userId: string, groupId: string): Promise<GroupTrashResult> {
  if (!isRowId(groupId)) return 'not_found';
  const postgres = getPostgresInstance();
  const group = (await postgres.queryOne(
    `SELECT name, created_by, group_type, is_system FROM groups
      WHERE id = $1 AND deleted_at IS NULL`,
    [groupId],
    { table: 'groups' }
  )) as Pick<GroupRow, 'name' | 'created_by' | 'group_type' | 'is_system'> | null;

  if (!group) return 'not_found';
  if (group.is_system) return 'system';
  if (!(await mayDelete(group, groupId, userId))) return 'forbidden';

  await notifyGroupMembers({
    groupId,
    excludeUserId: userId,
    type: 'group_deleted',
    title: 'Gruppe aufgelöst',
    body: `„${group.name}" wurde aufgelöst`,
    actionUrl: '/gruppen',
  });

  const rows = await postgres.query<{ members: number }>(
    `UPDATE groups SET deleted_at = now()
      WHERE id = $1 AND deleted_at IS NULL AND NOT is_system
      RETURNING (SELECT COUNT(*)::int FROM group_memberships WHERE group_id = groups.id) AS members`,
    [groupId]
  );
  if (rows.length === 0) return 'not_found';

  // Der Beleg, dass es dieses Projekt gab und wer es wann gelöscht hat: die
  // Benachrichtigung oben erreicht per `excludeUserId` gerade die löschende
  // Person nicht, und nach dem Purge ist die Zeile weg.
  // Der Name kommt von der Person und geht ungeprüft durch: `JSON.stringify`
  // escapt Zeilenumbrüche und Anführungszeichen, sonst könnte ein Name wie
  // `x\n[groupTrash] trashed group=…` eine zweite, erfundene Zeile ins Log
  // schreiben — und damit genau die Beweiskraft zerstören, für die diese Zeile
  // da ist.
  log.info(
    `[groupTrash] trashed group=${groupId} name=${JSON.stringify(group.name)} ` +
      `type=${group.group_type ?? 'unknown'} members=${rows[0].members} by=${userId}`
  );
  return 'ok';
}

/** Ein getrashtes Projekt, das `userId` wiederherstellen oder endgültig löschen darf. */
export async function getTrashedGroup(
  userId: string,
  groupId: string
): Promise<TrashedGroup | 'not_found' | 'forbidden'> {
  if (!isRowId(groupId)) return 'not_found';
  const row = (await getPostgresInstance().queryOne(
    `SELECT id, name, group_type, deleted_at, created_by, is_system FROM groups
      WHERE id = $1 AND deleted_at IS NOT NULL`,
    [groupId],
    { table: 'groups' }
  )) as (TrashedGroup & GroupRights) | null;
  if (!row) return 'not_found';
  if (!(await mayDelete(row, groupId, userId))) return 'forbidden';
  return { id: row.id, name: row.name, group_type: row.group_type, deleted_at: row.deleted_at };
}

/**
 * `deleted_at` zurücknehmen. Über Drizzle, weil nur dieser Pfad den pg-Fehlercode
 * behält (siehe `restoreOwnedRow`); eine Kollision auf einem eindeutigen Schlüssel
 * wird `conflict`, nie eine stille Umbenennung.
 */
export async function restoreGroup(userId: string, groupId: string): Promise<OwnedRestoreResult> {
  const found = await getTrashedGroup(userId, groupId);
  if (typeof found === 'string') return found;
  try {
    const result = await getDrizzleInstance().execute(
      sql`UPDATE groups SET deleted_at = NULL
          WHERE id = ${groupId} AND deleted_at IS NOT NULL RETURNING id`
    );
    return result.rows.length > 0 ? 'ok' : 'not_found';
  } catch (error) {
    if (isUniqueViolation(error)) return 'conflict';
    throw error;
  }
}

const MAY_DELETE_WHERE = `(g.created_by = $1 OR EXISTS (
  SELECT 1 FROM group_memberships gm
   WHERE gm.group_id = g.id AND gm.user_id = $1 AND gm.role = 'admin'))`;

export function listTrashedGroups(
  userId: string,
  opts: { limit: number; before: TrashCursor | null }
): Promise<TrashedGroup[]> {
  const params: unknown[] = [userId];
  const keyset = trashKeysetWhere('g.deleted_at', 'g.id', opts.before, params);
  params.push(opts.limit);
  return getPostgresInstance().query<TrashedGroup>(
    `SELECT g.id, g.name, g.group_type, g.deleted_at FROM groups g
      WHERE g.deleted_at IS NOT NULL AND NOT g.is_system AND ${MAY_DELETE_WHERE} AND ${keyset}
      ORDER BY ${trashOrderBy('g.deleted_at', 'g.id')}
      LIMIT $${params.length}`,
    params
  );
}

export async function listExpiredGroups(
  cutoff: Date,
  limit: number
): Promise<Array<{ id: string; userId: string | null }>> {
  const rows = await getPostgresInstance().query<{ id: string; created_by: string | null }>(
    `SELECT id, created_by FROM groups
      WHERE deleted_at IS NOT NULL AND deleted_at < $1
      ORDER BY deleted_at LIMIT $2`,
    [cutoff, limit]
  );
  return rows.map((r) => ({ id: r.id, userId: r.created_by }));
}

async function unlinkAvatar(avatarUrl: string): Promise<void> {
  try {
    await fs.promises.unlink(path.join(GROUP_AVATAR_DIR, path.basename(avatarUrl)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * Endgültig löschen: nur ein getrashtes Projekt, und nur eines, das vor `cutoff`
 * getrasht wurde (jedes bei null). Die Zeile wird in der Transaktion gesperrt,
 * bevor die Beitragsdateien gelesen werden — ein gleichzeitiges Wiederherstellen
 * wartet oder hat schon gewonnen, dann bleibt alles stehen. Dateien und Avatar
 * erst nach dem Commit; ein Fehler dort wird gemeldet, nie geworfen.
 */
export async function purgeGroup(groupId: string, cutoff: Date | null): Promise<boolean> {
  if (!isRowId(groupId)) return false;
  const postgres = getPostgresInstance();

  const purged = await postgres.transaction(async (client) => {
    const group = (await postgres.transactionQueryOne(
      client,
      `SELECT name, avatar_url FROM groups
        WHERE id = $1 AND deleted_at IS NOT NULL
          AND ($2::timestamptz IS NULL OR deleted_at < $2)
        FOR UPDATE`,
      [groupId, cutoff]
    )) as Pick<GroupRow, 'name' | 'avatar_url'> | null;
    if (!group) return null;

    // Die Zeilen fallen per Cascade mit dem Projekt, die Dateien nicht.
    const files = (await postgres.transactionQuery(
      client,
      'SELECT stored_filename FROM group_post_files WHERE group_id = $1',
      [groupId]
    )) as Array<Pick<GroupPostFileRow, 'stored_filename'>>;
    const postFiles = files.map((f) => f.stored_filename);

    await postgres.transactionExec(client, 'DELETE FROM group_instructions WHERE group_id = $1', [
      groupId,
    ]);
    await postgres.transactionExec(client, 'DELETE FROM group_content_shares WHERE group_id = $1', [
      groupId,
    ]);
    const memberships = await postgres.transactionExec(
      client,
      'DELETE FROM group_memberships WHERE group_id = $1',
      [groupId]
    );
    await postgres.transactionExec(client, 'DELETE FROM groups WHERE id = $1', [groupId]);
    return { group, postFiles, members: memberships.changes };
  });
  if (!purged) return false;

  log.info(
    `[groupTrash] purged group=${groupId} name=${JSON.stringify(purged.group.name)} ` +
      `members=${purged.members} files=${purged.postFiles.length}`
  );

  await purgeSideStore('group', groupId, 'group-post-files', () =>
    Promise.all(purged.postFiles.map(deleteGroupPostFile))
  );
  const avatarUrl = purged.group.avatar_url;
  if (avatarUrl) {
    await purgeSideStore('group', groupId, 'group-avatar', () => unlinkAvatar(avatarUrl));
  }
  return true;
}
