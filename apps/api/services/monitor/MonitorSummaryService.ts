import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

import { generateEntitySummary } from './SummaryGraph.js';

import type { MonitorArticle } from './types.js';
import type { WatcherEntity } from './watcherEntities.js';

const log = createLogger('MonitorSummary');

const SUMMARY_TTL_SECONDS = 3600; // 1 hour

export interface RiskItem {
  title: string;
  source: string;
  reasoning: string;
  severity: 'high' | 'medium' | 'low';
}

export interface EntitySummaryResult {
  summary: string;
  attackAnalysis: string;
  riskAnalysis?: { risks: RiskItem[]; opportunities: RiskItem[] } | null;
  generatedAt: string;
  articleCount: number;
}

function cacheKey(entityId: string, locale: string): string {
  return `monitor:summary:${entityId}:${locale}`;
}

export async function getEntitySummary(
  entity: WatcherEntity,
  articles: MonitorArticle[],
  locale: string
): Promise<EntitySummaryResult> {
  // Check cache
  try {
    const cached = await redisClient.get(cacheKey(entity.id, locale));
    if (cached) return JSON.parse(cached);
  } catch {
    // Fall through
  }

  const graphResult = await generateEntitySummary(entity.label, entity.summaryPrompt, articles);

  const result: EntitySummaryResult = {
    summary: graphResult.summary,
    attackAnalysis: graphResult.attackAnalysis,
    riskAnalysis: graphResult.riskAnalysis ?? null,
    generatedAt: new Date().toISOString(),
    articleCount: articles.length,
  };

  // Cache result
  try {
    await redisClient.set(cacheKey(entity.id, locale), JSON.stringify(result), {
      EX: SUMMARY_TTL_SECONDS,
    });
  } catch {
    // Non-critical
  }

  return result;
}
