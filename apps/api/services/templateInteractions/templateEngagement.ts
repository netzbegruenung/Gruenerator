/**
 * Like-Zahl und Reaktionen je Vorlage (`template`-ids) in zwei Queries —
 * dieselbe Zahl, die Karten zeigen und nach der „Beliebt" sortiert.
 */
import { type TemplateEngagement } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getLikeCountsForEntities } from '../entityLikes/EntityLikesService.js';
import { getReactionSummaries } from '../entityReactions/EntityReactionsService.js';

export async function getTemplateEngagement(
  ids: string[],
  viewerId: string
): Promise<TemplateEngagement[]> {
  const unique = [...new Set(ids)];
  const [likes, reactions] = await Promise.all([
    getLikeCountsForEntities('template', unique),
    getReactionSummaries('template', unique, viewerId),
  ]);
  return unique.map((id) => ({
    id,
    likes_count: likes.get(id) ?? 0,
    reactions: reactions.get(id) ?? [],
  }));
}

/** Likes + Reaktionen je id, nur ids mit mindestens einer; höchste zuerst. */
export async function getTemplateScores(limit: number): Promise<Map<string, number>> {
  const rows = await getPostgresInstance().query<{ entity_id: string; score: number }>(
    `SELECT entity_id, count(*)::int AS score FROM (
        SELECT entity_id FROM entity_likes WHERE entity_type = 'template'
        UNION ALL
        SELECT template_id AS entity_id FROM entity_reactions WHERE template_id IS NOT NULL
      ) s
      GROUP BY entity_id
      ORDER BY score DESC
      LIMIT $1`,
    [limit],
    { table: 'entity_likes' }
  );
  return new Map(rows.map((r) => [r.entity_id, r.score]));
}
