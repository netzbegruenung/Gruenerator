import { z } from 'zod';

import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import { generateEntitySummary, RiskAnalysisSchema } from './SummaryGraph.js';

import type { MonitorArticle } from './types.js';
import type { WatcherEntity } from './watcherEntities.js';

const SUMMARY_TTL_SECONDS = 3600; // 1 hour

const entitySummaryResultSchema = z.object({
  summary: z.string(),
  attackAnalysis: z.string(),
  riskAnalysis: RiskAnalysisSchema.nullable(),
  generatedAt: z.string(),
  articleCount: z.number(),
});
export type EntitySummaryResult = z.infer<typeof entitySummaryResultSchema>;

function cacheKey(entityId: string, locale: string): string {
  return `monitor:summary:${entityId}:${locale}`;
}

export async function getEntitySummary(
  entity: WatcherEntity,
  articles: MonitorArticle[],
  locale: string
): Promise<EntitySummaryResult> {
  const cached = await getCachedJson(cacheKey(entity.id, locale), entitySummaryResultSchema);
  if (cached) return cached;

  const graphResult = await generateEntitySummary(entity.label, articles);

  const result: EntitySummaryResult = {
    summary: graphResult.summary,
    attackAnalysis: graphResult.attackAnalysis,
    riskAnalysis: graphResult.riskAnalysis ?? null,
    generatedAt: new Date().toISOString(),
    articleCount: articles.length,
  };

  await setCachedJson(cacheKey(entity.id, locale), result, SUMMARY_TTL_SECONDS);

  return result;
}
