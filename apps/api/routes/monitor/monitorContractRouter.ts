/**
 * ts-rest contract router for the Themen-Monitor.
 *
 * Replaces the legacy Express routers (monitorController.ts +
 * internalController.ts). Thin handlers over the monitor services; the contract
 * (@gruenerator/contracts) is the source of truth for request/response shapes.
 *
 * Middleware is applied at the prefixes in routes.ts:
 *   - /api/monitor/*          → requireAuth + publicReadLimiter
 *   - /api/internal/monitor/* → requireAdminToken
 */
import { monitorContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { generateKeywordInsights } from '../../services/monitor/KeywordInsightsGraph.js';
import { getMeinungsbild } from '../../services/monitor/MeinungsbildService.js';
import { generateMonitorBriefing } from '../../services/monitor/MonitorBriefingGraph.js';
import {
  getLatestSnapshot,
  getHistory,
  getTopicArticles,
  searchArticles,
  searchArticlesByKeywords,
  getStimmung,
  refreshMonitor,
  refreshInstagram,
} from '../../services/monitor/MonitorService.js';
import { getEntitySummary } from '../../services/monitor/MonitorSummaryService.js';
import { getPolitProPolls, POLITPRO_PARLIAMENTS } from '../../services/monitor/PolitProService.js';
import { getPolls } from '../../services/monitor/PollScraper.js';
import { getStimmungSummary } from '../../services/monitor/StimmungSummaryService.js';
import { WATCHER_ENTITIES, getEntity } from '../../services/monitor/watcherEntities.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

import type { Application, Response } from 'express';

const log = createLogger('monitorContractRouter');

function cache(res: Response, value: string): void {
  res.setHeader('Cache-Control', value);
}

const s = initServer();

export const monitorContractRouter = s.router(monitorContract, {
  latest: async ({ query, res }) => {
    try {
      const snapshot = await getLatestSnapshot(query.locale);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'No monitor data available yet' } };
      }
      cache(res, 'private, max-age=120, stale-while-revalidate=300');
      return { status: 200 as const, body: snapshot };
    } catch (error) {
      log.error(`GET /latest failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch monitor data' } };
    }
  },

  history: async ({ query, res }) => {
    try {
      const history = await getHistory(query.days ?? 7);
      cache(res, 'private, max-age=600, stale-while-revalidate=1800');
      return { status: 200 as const, body: history };
    } catch (error) {
      log.error(`GET /history failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch monitor history' } };
    }
  },

  topicArticles: async ({ params, query, res }) => {
    try {
      const articles = await getTopicArticles(params.topic, query.limit ?? 20, query.locale);
      cache(res, 'private, max-age=120, stale-while-revalidate=300');
      return { status: 200 as const, body: { topic: params.topic, articles } };
    } catch (error) {
      log.error(`GET /topic failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch topic articles' } };
    }
  },

  search: async ({ query }) => {
    try {
      const articles = await searchArticles(query.q.trim(), query.locale);
      const sources = [...new Set(articles.map((a) => a.source))];
      return {
        status: 200 as const,
        body: { query: query.q, count: articles.length, sources, articles },
      };
    } catch (error) {
      log.error(`GET /search failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to search articles' } };
    }
  },

  keywordInsights: async ({ query, res }) => {
    try {
      const locale = query.locale ?? 'de';
      const snapshot = await getLatestSnapshot();
      if (!snapshot?.keywords?.length) {
        return { status: 404 as const, body: { error: 'No keywords available' } };
      }
      const insights = await generateKeywordInsights(snapshot.keywords, locale);
      cache(res, 'private, max-age=1800, stale-while-revalidate=3600');
      return { status: 200 as const, body: insights };
    } catch (error) {
      log.error(`GET /keyword-insights failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to generate keyword insights' } };
    }
  },

  briefing: async ({ query, res }) => {
    try {
      const locale = query.locale ?? 'de';
      const [snapshot, stimmung, pollData] = await Promise.all([
        getLatestSnapshot(locale),
        getStimmung(locale),
        getPolls(),
      ]);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'No monitor data available' } };
      }
      const result = await generateMonitorBriefing(locale, snapshot, stimmung, pollData.average);
      cache(res, 'private, max-age=1800, stale-while-revalidate=3600');
      return { status: 200 as const, body: result };
    } catch (error) {
      log.error(`GET /briefing failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to generate briefing' } };
    }
  },

  refreshBriefing: async ({ query }) => {
    try {
      const locale = query.locale ?? 'de';
      await redisClient.del(`monitor:briefing:${locale}`);
      const [snapshot, stimmung, pollData] = await Promise.all([
        getLatestSnapshot(locale),
        getStimmung(locale),
        getPolls(),
      ]);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'No monitor data available' } };
      }
      const result = await generateMonitorBriefing(locale, snapshot, stimmung, pollData.average);
      return { status: 200 as const, body: result };
    } catch (error) {
      log.error(`POST /briefing/refresh failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to regenerate briefing' } };
    }
  },

  pollParliaments: async ({ res }) => {
    cache(res, 'private, max-age=86400');
    return { status: 200 as const, body: [...POLITPRO_PARLIAMENTS] };
  },

  polls: async ({ query, res }) => {
    try {
      const parliament = query.parliament ?? 'deutschland';
      const politProData = await getPolitProPolls(parliament);
      if (!politProData) {
        log.warn(`PolitPro returned null for "${parliament}", falling back to wahlrecht.de`);
      }
      const data = politProData ?? (await getPolls());
      cache(res, 'private, max-age=1800, stale-while-revalidate=3600');
      return { status: 200 as const, body: data };
    } catch (error) {
      log.error(`GET /polls failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch polls' } };
    }
  },

  meinungsbild: async ({ res }) => {
    try {
      const data = await getMeinungsbild();
      if (!data) {
        return { status: 503 as const, body: { error: 'Meinungsbild data unavailable' } };
      }
      cache(res, 'private, max-age=3600, stale-while-revalidate=7200');
      return { status: 200 as const, body: data };
    } catch (error) {
      log.error(`GET /meinungsbild failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch meinungsbild data' } };
    }
  },

  stimmung: async ({ query, res }) => {
    try {
      const stimmung = await getStimmung(query.locale);
      const summary = await getStimmungSummary(query.locale, stimmung).catch(() => null);
      if (summary) {
        stimmung.moodSummary = summary.moodSummary;
        stimmung.moodReason = summary.dominantReason;
      }
      cache(res, 'private, max-age=300, stale-while-revalidate=600');
      return { status: 200 as const, body: stimmung };
    } catch (error) {
      log.error(`GET /stimmung failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch stimmung' } };
    }
  },

  entities: async ({ res }) => {
    cache(res, 'private, max-age=86400');
    return {
      status: 200 as const,
      body: WATCHER_ENTITIES.map(({ id, label, keywords }) => ({ id, label, keywords })),
    };
  },

  entitySummary: async ({ params, query, res }) => {
    try {
      const entity = getEntity(params.id);
      if (!entity) {
        return { status: 404 as const, body: { error: 'Entity not found' } };
      }
      const locale = query.locale ?? 'de';
      const articles = await searchArticlesByKeywords(
        entity.keywords,
        locale,
        50,
        entity.excludePatterns
      );
      const result = await getEntitySummary(entity, articles, locale);
      cache(res, 'private, max-age=600, stale-while-revalidate=1800');
      return {
        status: 200 as const,
        body: {
          entity: { id: entity.id, label: entity.label },
          count: result.articleCount,
          summary: result.summary,
          attackAnalysis: result.attackAnalysis,
          riskAnalysis: result.riskAnalysis ?? null,
          generatedAt: result.generatedAt,
        },
      };
    } catch (error) {
      log.error(`GET /entities/:id/summary failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to generate summary' } };
    }
  },

  entityResults: async ({ params, query, res }) => {
    try {
      const entity = getEntity(params.id);
      if (!entity) {
        return { status: 404 as const, body: { error: 'Entity not found' } };
      }
      const articles = await searchArticlesByKeywords(
        entity.keywords,
        query.locale,
        50,
        entity.excludePatterns
      );
      const sources = [...new Set(articles.map((a) => a.source))];
      cache(res, 'private, max-age=300, stale-while-revalidate=600');
      return {
        status: 200 as const,
        body: {
          entity: { id: entity.id, label: entity.label },
          count: articles.length,
          sources,
          articles,
        },
      };
    } catch (error) {
      log.error(`GET /entities/:id failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch entity results' } };
    }
  },

  refresh: async () => {
    try {
      log.info('Monitor refresh triggered by user');
      const snapshot = await refreshMonitor();
      return {
        status: 200 as const,
        body: {
          success: true,
          totalArticles: snapshot.totalArticles,
          activeTopics: snapshot.topics.filter((t) => t.articleCount > 0).length,
        },
      };
    } catch (error) {
      log.error(`POST /refresh failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Refresh failed' } };
    }
  },

  internalRefresh: async () => {
    try {
      log.info('Monitor refresh triggered externally');
      const snapshot = await refreshMonitor();
      return {
        status: 200 as const,
        body: {
          success: true,
          totalArticles: snapshot.totalArticles,
          activeTopics: snapshot.topics.filter((t) => t.articleCount > 0).length,
        },
      };
    } catch (error) {
      log.error(`Monitor refresh failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: toError(error).message } };
    }
  },

  internalRefreshInstagram: async () => {
    try {
      log.info('Instagram refresh triggered externally');
      const count = await refreshInstagram();
      return { status: 200 as const, body: { success: true, posts: count } };
    } catch (error) {
      log.error(`Instagram refresh failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: toError(error).message } };
    }
  },
});

export function mountMonitorContractRouter(app: Application): void {
  createExpressEndpoints(monitorContract, monitorContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'monitorContract'),
  });
}
