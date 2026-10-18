/**
 * Kommentare auf Marktplatz-Beiträgen: Agents, Rezepte, Vorlagen, Sticker und
 * Hintergründe, offizielle eingeschlossen. Ein Beitrag heißt wie bei Likes
 * `(entityType, entityId)` mit `entityId` = seinem Marktplatz-`ref`.
 *
 * Wer den Beitrag sehen darf (`commentTargets`), darf lesen und kommentieren.
 * Löschen: wer den Kommentar geschrieben hat oder wem der Beitrag gehört.
 * Antworten hängen eine Ebene tief am Kommentar oben, wie im Gruppen-Feed.
 * Ein gemeldeter, ausgeblendeter oder entfernter Kommentar bleibt nur für
 * seine Autor*in sichtbar.
 */
import {
  type EntityComment,
  type EntityCommentType,
  type ReactionSummary,
} from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  getItemReactionSummaries,
  getReactionSummaries,
} from '../entityReactions/EntityReactionsService.js';
import { isRowId } from '../trash/ownedRowTrash.js';

import { commentTargets } from './commentTargets.js';

export type EntityCommentOutcome<T> =
  { status: 200 | 201; data: T } | { status: 400 | 403 | 404; message: string };

const NO_ACCESS = { status: 403 as const, message: 'Kein Zugriff auf diesen Beitrag.' };
const COMMENT_NOT_FOUND = { status: 404 as const, message: 'Kommentar nicht gefunden.' };

interface CommentRow {
  id: string;
  entity_type: EntityCommentType;
  entity_id: string;
  parent_id: string | null;
  user_id: string | null;
  body: string;
  created_at: string | Date;
  author_name: string | null;
}

const COMMENT_COLUMNS = 'id, entity_type, entity_id, parent_id, user_id, body, created_at';
const AUTHOR_NAME = "COALESCE(NULLIF(p.display_name, ''), p.first_name) AS author_name";

function toComment(r: CommentRow, reactions: ReactionSummary[]): EntityComment {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    parentId: r.parent_id,
    userId: r.user_id,
    authorName: r.author_name || 'Ehemalige Person',
    body: r.body,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    reactions,
  };
}

export interface EntityDiscussion {
  /** Reactions on the item itself. */
  reactions: ReactionSummary[];
  comments: EntityComment[];
}

export async function listEntityComments(
  entityType: EntityCommentType,
  entityId: string,
  userId: string
): Promise<EntityCommentOutcome<EntityDiscussion>> {
  if (!(await commentTargets[entityType].canView(userId, entityId))) return NO_ACCESS;
  const rows = (await getPostgresInstance().query(
    `SELECT c.id, c.entity_type, c.entity_id, c.parent_id, c.user_id, c.body, c.created_at,
            ${AUTHOR_NAME}
       FROM entity_comments c
       LEFT JOIN profiles p ON p.id = c.user_id
      WHERE c.entity_type = $1 AND c.entity_id = $2
        AND (c.moderation = 'ok' OR c.user_id = $3::uuid)
      ORDER BY c.created_at`,
    [entityType, entityId, userId],
    { table: 'entity_comments' }
  )) as CommentRow[];
  const [commentReactions, itemReactions] = await Promise.all([
    getReactionSummaries(
      'entity_comment',
      rows.map((r) => r.id),
      userId
    ),
    getItemReactionSummaries(entityType, [entityId], userId),
  ]);
  return {
    status: 200,
    data: {
      reactions: itemReactions.get(entityId) ?? [],
      comments: rows.map((r) => toComment(r, commentReactions.get(r.id) ?? [])),
    },
  };
}

export async function createEntityComment(input: {
  entityType: EntityCommentType;
  entityId: string;
  userId: string;
  body: string;
  /** Eine Antwort auf eine Antwort hängt am selben Kommentar oben. */
  parentId: string | null;
}): Promise<EntityCommentOutcome<EntityComment>> {
  const { entityType, entityId, userId } = input;
  const body = input.body.trim();
  if (!(await commentTargets[entityType].canView(userId, entityId))) return NO_ACCESS;
  if (!body) return { status: 400, message: 'Kommentar ist leer.' };
  const postgres = getPostgresInstance();

  let parentId: string | null = null;
  if (input.parentId) {
    if (!isRowId(input.parentId)) return COMMENT_NOT_FOUND;
    const parent = (await postgres.queryOne(
      `SELECT id, parent_id FROM entity_comments
        WHERE id = $1::uuid AND entity_type = $2 AND entity_id = $3
          AND (moderation = 'ok' OR user_id = $4::uuid)`,
      [input.parentId, entityType, entityId, userId],
      { table: 'entity_comments' }
    )) as { id: string; parent_id: string | null } | null;
    if (!parent) return COMMENT_NOT_FOUND;
    parentId = parent.parent_id ?? parent.id;
  }

  const row = (await postgres.queryOne(
    `WITH ins AS (
       INSERT INTO entity_comments (entity_type, entity_id, user_id, body, parent_id)
       VALUES ($1, $2, $3::uuid, $4, $5)
       RETURNING ${COMMENT_COLUMNS}
     )
     SELECT ins.*, ${AUTHOR_NAME}
       FROM ins LEFT JOIN profiles p ON p.id = ins.user_id`,
    [entityType, entityId, userId, body, parentId],
    { table: 'entity_comments' }
  )) as CommentRow | null;
  if (!row) throw new Error('Kommentar konnte nicht gespeichert werden.');
  return { status: 201, data: toComment(row, []) };
}

export async function deleteEntityComment(input: {
  entityType: EntityCommentType;
  entityId: string;
  commentId: string;
  userId: string;
}): Promise<EntityCommentOutcome<null>> {
  const { entityType, entityId, commentId, userId } = input;
  const target = commentTargets[entityType];
  if (!(await target.canView(userId, entityId))) return NO_ACCESS;
  if (!isRowId(commentId)) return COMMENT_NOT_FOUND;
  const postgres = getPostgresInstance();
  const comment = (await postgres.queryOne(
    'SELECT user_id FROM entity_comments WHERE id = $1::uuid AND entity_type = $2 AND entity_id = $3',
    [commentId, entityType, entityId],
    { table: 'entity_comments' }
  )) as { user_id: string | null } | null;
  if (!comment) return COMMENT_NOT_FOUND;
  if (comment.user_id !== userId && (await target.ownerId(entityId)) !== userId) {
    return { status: 403, message: 'Du kannst nur eigene Kommentare löschen.' };
  }
  await postgres.exec('DELETE FROM entity_comments WHERE id = $1::uuid', [commentId]);
  return { status: 200, data: null };
}
