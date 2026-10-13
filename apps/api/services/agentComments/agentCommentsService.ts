/**
 * Kommentare auf Grünerator-Agenten.
 *
 * Wer den Agenten öffnen darf (`getAccessibleUserAgentById`: Besitzer*in,
 * Gruppenmitglied über eine Freigabe oder angemeldet bei `authenticated`),
 * darf lesen, kommentieren und reagieren. Löschen: wer den Kommentar
 * geschrieben hat oder der Agent gehört. Antworten hängen eine Ebene tief am
 * Kommentar oben, wie im Gruppen-Feed.
 */
import { type AgentComment, type ReactionSummary } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getReactionSummaries } from '../entityReactions/EntityReactionsService.js';
import { getAccessibleUserAgentById } from '../userAgents/userAgentsRepository.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AgentCommentOutcome<T> =
  { status: 200 | 201; data: T } | { status: 400 | 403 | 404; message: string };

const AGENT_NOT_FOUND = { status: 404 as const, message: 'Agent nicht gefunden.' };
const COMMENT_NOT_FOUND = { status: 404 as const, message: 'Kommentar nicht gefunden.' };

interface CommentRow {
  id: string;
  agent_id: string;
  parent_id: string | null;
  user_id: string | null;
  body: string;
  created_at: string | Date;
  author_name: string | null;
}

function toComment(r: CommentRow, reactions: ReactionSummary[]): AgentComment {
  return {
    id: r.id,
    agentId: r.agent_id,
    parentId: r.parent_id,
    userId: r.user_id,
    authorName: r.author_name || 'Ehemalige Person',
    body: r.body,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    reactions,
  };
}

/** Der Agent samt Besitz-Flag, wenn die Person ihn öffnen darf. */
export async function findAccessibleAgent(
  agentId: string,
  userId: string
): Promise<{ id: string; ownerId: string } | null> {
  if (!UUID_RE.test(agentId)) return null;
  const agent = await getAccessibleUserAgentById(agentId, userId);
  if (!agent) return null;
  const owner = (await getPostgresInstance().queryOne(
    'SELECT user_id FROM user_agents WHERE id = $1::uuid',
    [agentId],
    { table: 'user_agents' }
  )) as { user_id: string } | null;
  return owner ? { id: agentId, ownerId: owner.user_id } : null;
}

export async function listAgentComments(
  agentId: string,
  userId: string
): Promise<AgentCommentOutcome<{ reactions: ReactionSummary[]; comments: AgentComment[] }>> {
  if (!(await findAccessibleAgent(agentId, userId))) return AGENT_NOT_FOUND;
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT c.id, c.agent_id, c.parent_id, c.user_id, c.body, c.created_at,
            COALESCE(NULLIF(p.display_name, ''), p.first_name) AS author_name
       FROM agent_comments c
       LEFT JOIN profiles p ON p.id = c.user_id
      WHERE c.agent_id = $1::uuid
      ORDER BY c.created_at`,
    [agentId],
    { table: 'agent_comments' }
  )) as CommentRow[];
  const [commentReactions, agentReactions] = await Promise.all([
    getReactionSummaries(
      'agent_comment',
      rows.map((r) => r.id),
      userId
    ),
    getReactionSummaries('agent', [agentId], userId),
  ]);
  return {
    status: 200,
    data: {
      reactions: agentReactions.get(agentId) ?? [],
      comments: rows.map((r) => toComment(r, commentReactions.get(r.id) ?? [])),
    },
  };
}

export async function createAgentComment(input: {
  agentId: string;
  userId: string;
  body: string;
  /** Eine Antwort auf eine Antwort hängt am selben Kommentar oben. */
  parentId?: string | null | undefined;
}): Promise<AgentCommentOutcome<AgentComment>> {
  const { agentId, userId } = input;
  const body = input.body.trim();
  if (!(await findAccessibleAgent(agentId, userId))) return AGENT_NOT_FOUND;
  if (!body) return { status: 400, message: 'Kommentar ist leer.' };
  const postgres = getPostgresInstance();

  let parentId: string | null = null;
  if (input.parentId) {
    const parent = (await postgres.queryOne(
      'SELECT id, parent_id FROM agent_comments WHERE id = $1::uuid AND agent_id = $2::uuid',
      [input.parentId, agentId],
      { table: 'agent_comments' }
    )) as { id: string; parent_id: string | null } | null;
    if (!parent) return COMMENT_NOT_FOUND;
    parentId = parent.parent_id ?? parent.id;
  }

  const row = (await postgres.queryOne(
    `WITH ins AS (
       INSERT INTO agent_comments (agent_id, user_id, body, parent_id)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       RETURNING id, agent_id, parent_id, user_id, body, created_at
     )
     SELECT ins.*, COALESCE(NULLIF(p.display_name, ''), p.first_name) AS author_name
       FROM ins LEFT JOIN profiles p ON p.id = ins.user_id`,
    [agentId, userId, body, parentId],
    { table: 'agent_comments' }
  )) as CommentRow | null;
  if (!row) throw new Error('Kommentar konnte nicht gespeichert werden.');
  return { status: 201, data: toComment(row, []) };
}

export async function deleteAgentComment(input: {
  agentId: string;
  commentId: string;
  userId: string;
}): Promise<AgentCommentOutcome<null>> {
  const { agentId, commentId, userId } = input;
  const agent = await findAccessibleAgent(agentId, userId);
  if (!agent) return AGENT_NOT_FOUND;
  if (!UUID_RE.test(commentId)) return COMMENT_NOT_FOUND;
  const postgres = getPostgresInstance();
  const comment = (await postgres.queryOne(
    'SELECT user_id FROM agent_comments WHERE id = $1::uuid AND agent_id = $2::uuid',
    [commentId, agentId],
    { table: 'agent_comments' }
  )) as { user_id: string | null } | null;
  if (!comment) return COMMENT_NOT_FOUND;
  if (comment.user_id !== userId && agent.ownerId !== userId) {
    return { status: 403, message: 'Du kannst nur eigene Kommentare löschen.' };
  }
  await postgres.exec('DELETE FROM agent_comments WHERE id = $1::uuid', [commentId]);
  return { status: 200, data: null };
}
