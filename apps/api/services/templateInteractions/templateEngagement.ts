/**
 * Like-Zahl je Vorlage (`template`-ids) — dieselbe Zahl, die Karten zeigen und
 * nach der „Beliebt" sortiert.
 */
import { type TemplateEngagement } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getLikeCountsForEntities } from '../entityLikes/EntityLikesService.js';

export async function getTemplateEngagement(ids: string[]): Promise<TemplateEngagement[]> {
  const unique = [...new Set(ids)];
  const likes = await getLikeCountsForEntities('template', unique);
  return unique.map((id) => ({ id, likes_count: likes.get(id) ?? 0 }));
}

/** Likes je id, nur ids mit mindestens einem; höchste zuerst. */
export async function getTemplateScores(limit: number): Promise<Map<string, number>> {
  const rows = await getPostgresInstance().query<{ entity_id: string; score: number }>(
    `SELECT entity_id, count(*)::int AS score
       FROM entity_likes
      WHERE entity_type = 'template'
      GROUP BY entity_id
      ORDER BY score DESC
      LIMIT $1`,
    [limit],
    { table: 'entity_likes' }
  );
  return new Map(rows.map((r) => [r.entity_id, r.score]));
}
