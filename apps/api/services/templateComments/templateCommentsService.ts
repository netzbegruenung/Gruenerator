/**
 * Kommentare auf Vorlagen (Community-Vorlagen und Grünerator-Katalog).
 *
 * Die `template_id` ist die Galerie-id wie bei Likes; wer die Vorlage sehen
 * darf (`templateExistsFor`), darf lesen und kommentieren. Löschen: wer den
 * Kommentar geschrieben hat oder der Community-Vorlage besitzt. Antworten
 * hängen eine Ebene tief am Kommentar oben, wie im Gruppen-Feed.
 */
import { type ReactionSummary, type TemplateComment } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getReactionSummaries } from '../entityReactions/EntityReactionsService.js';
import { isUserTemplateId, templateExistsFor } from '../templateInteractions/templateTarget.js';

export type TemplateCommentOutcome<T> =
  { status: 200 | 201; data: T } | { status: 400 | 403 | 404; message: string };

const TEMPLATE_NOT_FOUND = { status: 404 as const, message: 'Vorlage nicht gefunden.' };
const COMMENT_NOT_FOUND = { status: 404 as const, message: 'Kommentar nicht gefunden.' };

interface CommentRow {
  id: string;
  template_id: string;
  parent_id: string | null;
  user_id: string | null;
  body: string;
  created_at: string | Date;
  author_name: string | null;
}

function toComment(r: CommentRow, reactions: ReactionSummary[]): TemplateComment {
  return {
    id: r.id,
    templateId: r.template_id,
    parentId: r.parent_id,
    userId: r.user_id,
    authorName: r.author_name || 'Ehemalige Person',
    body: r.body,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    reactions,
  };
}

export async function listTemplateComments(
  templateId: string,
  userId: string
): Promise<TemplateCommentOutcome<TemplateComment[]>> {
  if (!(await templateExistsFor(userId, templateId))) return TEMPLATE_NOT_FOUND;
  const rows = (await getPostgresInstance().query(
    `SELECT c.id, c.template_id, c.parent_id, c.user_id, c.body, c.created_at,
            COALESCE(NULLIF(p.display_name, ''), p.first_name) AS author_name
       FROM template_comments c
       LEFT JOIN profiles p ON p.id = c.user_id
      WHERE c.template_id = $1
      ORDER BY c.created_at`,
    [templateId],
    { table: 'template_comments' }
  )) as CommentRow[];
  const reactions = await getReactionSummaries(
    'template_comment',
    rows.map((r) => r.id),
    userId
  );
  return { status: 200, data: rows.map((r) => toComment(r, reactions.get(r.id) ?? [])) };
}

export async function createTemplateComment(input: {
  templateId: string;
  userId: string;
  body: string;
  /** Eine Antwort auf eine Antwort hängt am selben Kommentar oben. */
  parentId?: string | null | undefined;
}): Promise<TemplateCommentOutcome<TemplateComment>> {
  const { templateId, userId } = input;
  const body = input.body.trim();
  if (!(await templateExistsFor(userId, templateId))) return TEMPLATE_NOT_FOUND;
  if (!body) return { status: 400, message: 'Kommentar ist leer.' };
  const postgres = getPostgresInstance();

  let parentId: string | null = null;
  if (input.parentId) {
    const parent = (await postgres.queryOne(
      'SELECT id, parent_id FROM template_comments WHERE id = $1::uuid AND template_id = $2',
      [input.parentId, templateId],
      { table: 'template_comments' }
    )) as { id: string; parent_id: string | null } | null;
    if (!parent) return COMMENT_NOT_FOUND;
    parentId = parent.parent_id ?? parent.id;
  }

  const row = (await postgres.queryOne(
    `WITH ins AS (
       INSERT INTO template_comments (template_id, user_id, body, parent_id)
       VALUES ($1, $2::uuid, $3, $4)
       RETURNING id, template_id, parent_id, user_id, body, created_at
     )
     SELECT ins.*, COALESCE(NULLIF(p.display_name, ''), p.first_name) AS author_name
       FROM ins LEFT JOIN profiles p ON p.id = ins.user_id`,
    [templateId, userId, body, parentId],
    { table: 'template_comments' }
  )) as CommentRow | null;
  if (!row) throw new Error('Kommentar konnte nicht gespeichert werden.');
  return { status: 201, data: toComment(row, []) };
}

async function isTemplateOwner(templateId: string, userId: string): Promise<boolean> {
  if (!isUserTemplateId(templateId)) return false;
  const row = (await getPostgresInstance().queryOne(
    'SELECT user_id FROM user_templates WHERE id = $1::uuid AND deleted_at IS NULL',
    [templateId],
    { table: 'user_templates' }
  )) as { user_id: string | null } | null;
  return row?.user_id === userId;
}

export async function deleteTemplateComment(input: {
  templateId: string;
  commentId: string;
  userId: string;
}): Promise<TemplateCommentOutcome<null>> {
  const { templateId, commentId, userId } = input;
  if (!(await templateExistsFor(userId, templateId))) return TEMPLATE_NOT_FOUND;
  if (!isUserTemplateId(commentId)) return COMMENT_NOT_FOUND;
  const postgres = getPostgresInstance();
  const comment = (await postgres.queryOne(
    'SELECT user_id FROM template_comments WHERE id = $1::uuid AND template_id = $2',
    [commentId, templateId],
    { table: 'template_comments' }
  )) as { user_id: string | null } | null;
  if (!comment) return COMMENT_NOT_FOUND;
  if (comment.user_id !== userId && !(await isTemplateOwner(templateId, userId))) {
    return { status: 403, message: 'Du kannst nur eigene Kommentare löschen.' };
  }
  await postgres.exec('DELETE FROM template_comments WHERE id = $1::uuid', [commentId]);
  return { status: 200, data: null };
}
