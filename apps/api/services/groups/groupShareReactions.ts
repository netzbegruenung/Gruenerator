/**
 * Reaktionen an Freigaben (`group_share`) und deren Kommentaren
 * (`group_comment`) abräumen, BEVOR die Freigaben gelöscht werden: die
 * Kommentare fallen per FK-Cascade mit der Freigabe, `entity_reactions` hat
 * keinen FK auf `entity_id` — danach wüsste niemand mehr, welche Kommentar-IDs
 * es gab. Jede Stelle, die `group_content_shares` hart löscht, ruft das mit
 * derselben Auswahl wie ihr eigenes DELETE.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

/** Dieselbe Auswahl wie das folgende `DELETE FROM group_content_shares`. */
export type ShareSelector =
  | { groupId: string }
  | {
      contentTypes: readonly string[];
      contentId: string;
      groupId?: string;
      sharedBy?: string;
    };

/** Läuft in der Transaktion des Aufrufers, wenn er eine hat. */
export type SqlExec = (sql: string, params: unknown[]) => Promise<unknown>;

export function shareReactionsDeleteSql(selector: ShareSelector): {
  sql: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };
  if ('contentTypes' in selector) {
    add('content_type = ANY(?::text[])', [...selector.contentTypes]);
    add('content_id = ?', selector.contentId);
    if (selector.sharedBy) add('shared_by_user_id = ?::uuid', selector.sharedBy);
  }
  if (selector.groupId) add('group_id = ?::uuid', selector.groupId);

  return {
    sql: `WITH doomed AS (SELECT id FROM group_content_shares WHERE ${where.join(' AND ')})
      DELETE FROM entity_reactions
       WHERE (entity_type = 'group_share' AND entity_id IN (SELECT id::text FROM doomed))
          OR (entity_type = 'group_comment' AND entity_id IN (
                SELECT c.id::text FROM group_share_comments c
                 WHERE c.share_id IN (SELECT id FROM doomed)))`,
    params,
  };
}

export async function deleteReactionsForShares(
  selector: ShareSelector,
  exec: SqlExec = (sql, params) => getPostgresInstance().exec(sql, params)
): Promise<void> {
  const { sql, params } = shareReactionsDeleteSql(selector);
  await exec(sql, params);
}
