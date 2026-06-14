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
import {
  monitorContract,
  type MonitorHotTopicAnalysis,
  type PollData,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getWhatHappened,
  getWhatHappenedDaySummary,
  upsertSyncEvents,
} from '../../services/monitor/ContentSyncEventsService.js';
import { getEuGreenProfile } from '../../services/monitor/EuGreenProfileService.js';
import { getHotTopicAnalysis } from '../../services/monitor/HotTopicPipeline.js';
import { getMeinungsbild } from '../../services/monitor/MeinungsbildService.js';
import {
  getLatestSnapshot,
  getHistory,
  getTopicArticles,
  searchArticles,
  searchArticlesByKeywords,
  refreshMonitor,
  refreshInstagram,
} from '../../services/monitor/MonitorService.js';
import { getEntitySummary } from '../../services/monitor/MonitorSummaryService.js';
import {
  getEuGreens,
  getEuGreensHistory,
  getPolitProHistory,
  getPolitProPolls,
  POLITPRO_PARLIAMENTS,
} from '../../services/monitor/PolitProService.js';
import { getStateElections } from '../../services/monitor/StateElectionsService.js';
import { WATCHER_ENTITIES, getEntity } from '../../services/monitor/watcherEntities.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, Response } from 'express';

const log = createLogger('monitorContractRouter');

function cache(res: Response, value: string): void {
  res.setHeader('Cache-Control', value);
}

function toBriefingBody(analysis: MonitorHotTopicAnalysis) {
  return {
    briefing: analysis.briefing,
    tweets: analysis.tweets,
    generatedAt: analysis.generatedAt,
    citations: analysis.citations,
  };
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
      const snapshot = await getLatestSnapshot(locale);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'No monitor data available' } };
      }
      const analysis = await getHotTopicAnalysis(locale, snapshot);
      cache(res, 'private, max-age=1800, stale-while-revalidate=3600');
      return {
        status: 200 as const,
        body: {
          text: analysis.positionsText,
          dominantTopic: analysis.dominantTopic,
          secondaryTopics: analysis.secondaryTopics,
          citations: analysis.citations,
          confidence: analysis.confidence,
          generatedAt: analysis.generatedAt,
        },
      };
    } catch (error) {
      log.error(`GET /keyword-insights failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to generate keyword insights' } };
    }
  },

  briefing: async ({ query, res }) => {
    try {
      const locale = query.locale ?? 'de';
      const snapshot = await getLatestSnapshot(locale);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'No monitor data available' } };
      }
      const analysis = await getHotTopicAnalysis(locale, snapshot);
      cache(res, 'private, max-age=1800, stale-while-revalidate=3600');
      return { status: 200 as const, body: toBriefingBody(analysis) };
    } catch (error) {
      log.error(`GET /briefing failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to generate briefing' } };
    }
  },

  refreshBriefing: async ({ query }) => {
    try {
      const locale = query.locale ?? 'de';
      const snapshot = await getLatestSnapshot(locale);
      if (!snapshot) {
        return { status: 404 as const, body: { error: 'No monitor data available' } };
      }
      const analysis = await getHotTopicAnalysis(locale, snapshot, { forceRefresh: true });
      return { status: 200 as const, body: toBriefingBody(analysis) };
    } catch (error) {
      log.error(`POST /briefing/refresh failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to regenerate briefing' } };
    }
  },

  pollParliaments: async ({ res }) => {
    cache(res, 'private, max-age=86400');
    return { status: 200 as const, body: [...POLITPRO_PARLIAMENTS] };
  },

  euGreensHistory: async ({ res }) => {
    try {
      const data = await getEuGreensHistory();
      if (!data) {
        return { status: 503 as const, body: { error: 'EU greens history unavailable' } };
      }
      cache(res, 'private, max-age=3600, stale-while-revalidate=7200');
      return { status: 200 as const, body: data };
    } catch (error) {
      log.error(`GET /polls/eu-greens/history failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch EU greens history' } };
    }
  },

  euGreenProfile: async ({ query, res }) => {
    try {
      const data = await getEuGreenProfile(query.country);
      if (!data) {
        return { status: 404 as const, body: { error: 'Unknown party' } };
      }
      cache(res, 'private, max-age=3600, stale-while-revalidate=7200');
      return { status: 200 as const, body: data };
    } catch (error) {
      log.error(`GET /polls/eu-greens/profile failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to generate party profile' } };
    }
  },

  euGreens: async ({ res }) => {
    try {
      const data = await getEuGreens();
      if (!data) {
        return { status: 503 as const, body: { error: 'EU greens data unavailable' } };
      }
      cache(res, 'private, max-age=3600, stale-while-revalidate=7200');
      return { status: 200 as const, body: data };
    } catch (error) {
      log.error(`GET /polls/eu-greens failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch EU greens data' } };
    }
  },

  pollsHistory: async ({ query, res }) => {
    try {
      const data = await getPolitProHistory(query.parliament ?? 'deutschland');
      if (!data) {
        return { status: 404 as const, body: { error: 'No history for this parliament' } };
      }
      cache(res, 'private, max-age=3600, stale-while-revalidate=7200');
      return { status: 200 as const, body: data };
    } catch (error) {
      log.error(`GET /polls/history failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch poll history' } };
    }
  },

  polls: async ({ query, res }) => {
    try {
      const parliament = query.parliament ?? 'deutschland';
      // PolitPro is the only poll source — if it has nothing, serve empty data.
      const data: PollData | null = await getPolitProPolls(parliament);
      cache(res, 'private, max-age=1800, stale-while-revalidate=3600');
      return {
        status: 200 as const,
        body: data ?? {
          polls: [],
          lastElection: null,
          average: {},
          scrapedAt: new Date().toISOString(),
        },
      };
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

  elections: async ({ res }) => {
    try {
      const data = await getStateElections();
      if (!data) {
        return { status: 503 as const, body: { error: 'State election data unavailable' } };
      }
      cache(res, 'private, max-age=86400, stale-while-revalidate=172800');
      return { status: 200 as const, body: data };
    } catch (error) {
      log.error(`GET /elections failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch state election data' } };
    }
  },

  whatHappenedSummary: async ({ query, res }) => {
    try {
      const result = await getWhatHappenedDaySummary(query.date, query.locale ?? 'de');
      if (!result) {
        return { status: 404 as const, body: { error: 'No articles for this date' } };
      }
      cache(res, 'private, max-age=600, stale-while-revalidate=1800');
      return { status: 200 as const, body: result };
    } catch (error) {
      log.error(`GET /what-happened/summary failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to generate digest' } };
    }
  },

  whatHappened: async ({ query, res }) => {
    try {
      const result = await getWhatHappened(query);
      cache(res, 'private, max-age=300, stale-while-revalidate=600');
      return { status: 200 as const, body: result };
    } catch (error) {
      log.error(`GET /what-happened failed: ${toError(error).message}`);
      return { status: 500 as const, body: { error: 'Failed to fetch sync articles' } };
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

  internalSyncEvents: async ({ body }) => {
    try {
      // A --force run re-indexes the whole corpus; its 'updated' events would
      // flood the feed with re-index noise, so only genuinely new articles count.
      const events = body.force ? body.events.filter((e) => e.eventType === 'stored') : body.events;
      const upserted = await upsertSyncEvents(events, { runId: body.runId, runUrl: body.runUrl });
      log.info(`Sync events ingested: ${body.events.length} received, ${upserted} upserted`);
      return {
        status: 200 as const,
        body: { success: true, received: body.events.length, upserted },
      };
    } catch (error) {
      log.error(`POST /sync-events failed: ${toError(error).message}`);
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
