/**
 * Reaktionen an Board-Kommentaren (`board_comment`) abräumen. `entity_reactions`
 * hat keinen FK auf `entity_id`, die Kommentare fallen aber per Cascade: mit
 * dem Board (`board_id`), mit ihrer Autorin (`user_id`, Kontolöschung) und mit
 * ihrem Elternkommentar (`parent_id`). Deshalb werden die IDs VOR dem Löschen
 * gesammelt — danach wüsste niemand mehr, welche es gab.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

/** Dieselbe Auswahl wie das Löschen, das folgt; Antworten fallen mit. */
export type BoardCommentSelector =
  { commentId: string } | { boardId: string } | { authorId: string };

export type SqlQuery = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
) => Promise<T[]>;

const defaultQuery: SqlQuery = (sql, params) => getPostgresInstance().query(sql, params);

function selectorClause(selector: BoardCommentSelector): { column: string; value: string } {
  if ('commentId' in selector) return { column: 'id', value: selector.commentId };
  if ('boardId' in selector) return { column: 'board_id', value: selector.boardId };
  return { column: 'user_id', value: selector.authorId };
}

/** IDs der Kommentare, die das Löschen mitnimmt — samt Antworten darauf. */
export async function collectDoomedBoardCommentIds(
  selector: BoardCommentSelector,
  query: SqlQuery = defaultQuery
): Promise<string[]> {
  const { column, value } = selectorClause(selector);
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM board_comments
      WHERE ${column} = $1::uuid
         OR parent_id IN (SELECT id FROM board_comments WHERE ${column} = $1::uuid)`,
    [value]
  );
  return rows.map((r) => r.id);
}

export async function deleteBoardCommentReactions(
  commentIds: string[],
  query: SqlQuery = defaultQuery
): Promise<void> {
  if (commentIds.length === 0) return;
  await query(
    `DELETE FROM entity_reactions
      WHERE entity_type = 'board_comment' AND entity_id = ANY($1::text[])`,
    [commentIds]
  );
}
