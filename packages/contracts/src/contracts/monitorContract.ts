/**
 * ts-rest contract for the Themen-Monitor endpoints.
 *
 * Covers the routes implemented in
 * apps/api/routes/monitor/monitorContractRouter.ts.
 *
 * Middleware (applied at the prefixes in routes.ts, not here):
 *   - /api/monitor/*          → requireAuth + publicReadLimiter
 *   - /api/internal/monitor/* → requireAdminToken
 *
 * Route ordering note: more specific literal paths are declared before their
 * `:param` siblings (`/polls/parliaments` before `/polls`,
 * `/entities/:id/summary` before `/entities/:id`) so Express does not let the
 * param route swallow the literal one.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  entityResultsResponseSchema,
  entitySummaryResponseSchema,
  internalSyncEventsBodySchema,
  internalSyncEventsResponseSchema,
  keywordInsightsResponseSchema,
  meinungsbildResponseSchema,
  monitorBriefingResponseSchema,
  monitorErrorResponseSchema,
  monitorHistoryQuerySchema,
  monitorHistoryResponseSchema,
  monitorInstagramRefreshResponseSchema,
  monitorLocaleQuerySchema,
  monitorRefreshResponseSchema,
  monitorSearchQuerySchema,
  monitorSearchResponseSchema,
  monitorSnapshotSchema,
  pollDataSchema,
  pollParliamentsResponseSchema,
  pollsQuerySchema,
  stateElectionsResponseSchema,
  topicArticlesQuerySchema,
  topicArticlesResponseSchema,
  topicCategorySchema,
  watcherEntitiesResponseSchema,
  whatHappenedQuerySchema,
  whatHappenedResponseSchema,
} from '../schemas/monitor.js';

const c = initContract();

export const monitorContract = c.router(
  {
    /** GET /api/monitor/latest — most recent cached snapshot. */
    latest: {
      method: 'GET',
      path: '/api/monitor/latest',
      query: monitorLocaleQuerySchema,
      responses: {
        200: monitorSnapshotSchema,
        404: monitorErrorResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Latest monitor snapshot',
    },

    /** GET /api/monitor/history — topic time-series for the last N days. */
    history: {
      method: 'GET',
      path: '/api/monitor/history',
      query: monitorHistoryQuerySchema,
      responses: {
        200: monitorHistoryResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Monitor history time-series',
    },

    /** GET /api/monitor/topic/:topic — top articles for a topic. */
    topicArticles: {
      method: 'GET',
      path: '/api/monitor/topic/:topic',
      pathParams: z.object({ topic: topicCategorySchema }),
      query: topicArticlesQuerySchema,
      responses: {
        200: topicArticlesResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Top articles for a topic',
    },

    /** GET /api/monitor/search — full-text article search. */
    search: {
      method: 'GET',
      path: '/api/monitor/search',
      query: monitorSearchQuerySchema,
      responses: {
        200: monitorSearchResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Search monitor articles',
    },

    /** GET /api/monitor/keyword-insights — RAG insights over keyword cloud. */
    keywordInsights: {
      method: 'GET',
      path: '/api/monitor/keyword-insights',
      query: monitorLocaleQuerySchema,
      responses: {
        200: keywordInsightsResponseSchema,
        404: monitorErrorResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Keyword insights',
    },

    /** GET /api/monitor/briefing — AI daily briefing. */
    briefing: {
      method: 'GET',
      path: '/api/monitor/briefing',
      query: monitorLocaleQuerySchema,
      responses: {
        200: monitorBriefingResponseSchema,
        404: monitorErrorResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'AI monitor briefing',
    },

    /** POST /api/monitor/briefing/refresh — invalidate cache + regenerate. */
    refreshBriefing: {
      method: 'POST',
      path: '/api/monitor/briefing/refresh',
      query: monitorLocaleQuerySchema,
      body: c.noBody(),
      responses: {
        200: monitorBriefingResponseSchema,
        404: monitorErrorResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Regenerate the AI briefing',
    },

    /** GET /api/monitor/polls/parliaments — available poll parliaments. */
    pollParliaments: {
      method: 'GET',
      path: '/api/monitor/polls/parliaments',
      responses: {
        200: pollParliamentsResponseSchema,
      },
      summary: 'Available poll parliaments',
    },

    /** GET /api/monitor/polls — poll averages (PolitPro, wahlrecht.de fallback). */
    polls: {
      method: 'GET',
      path: '/api/monitor/polls',
      query: pollsQuerySchema,
      responses: {
        200: pollDataSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Poll data',
    },

    /** GET /api/monitor/meinungsbild — GERDA MRP issue estimates. */
    meinungsbild: {
      method: 'GET',
      path: '/api/monitor/meinungsbild',
      responses: {
        200: meinungsbildResponseSchema,
        500: monitorErrorResponseSchema,
        503: monitorErrorResponseSchema,
      },
      summary: 'Meinungsbild estimates',
    },

    /** GET /api/monitor/elections — latest Landtagswahl results per Bundesland (GERDA). */
    elections: {
      method: 'GET',
      path: '/api/monitor/elections',
      responses: {
        200: stateElectionsResponseSchema,
        500: monitorErrorResponseSchema,
        503: monitorErrorResponseSchema,
      },
      summary: 'State election results (Landtagswahlen)',
    },

    /** GET /api/monitor/what-happened — content-sync article feed, day-grouped. */
    whatHappened: {
      method: 'GET',
      path: '/api/monitor/what-happened',
      query: whatHappenedQuerySchema,
      responses: {
        200: whatHappenedResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Articles added to notebooks by the content sync',
    },

    /** GET /api/monitor/entities — watcher entity list. */
    entities: {
      method: 'GET',
      path: '/api/monitor/entities',
      responses: {
        200: watcherEntitiesResponseSchema,
      },
      summary: 'Watcher entities',
    },

    /** GET /api/monitor/entities/:id/summary — AI summary for a watcher entity. */
    entitySummary: {
      method: 'GET',
      path: '/api/monitor/entities/:id/summary',
      pathParams: z.object({ id: z.string() }),
      query: monitorLocaleQuerySchema,
      responses: {
        200: entitySummaryResponseSchema,
        404: monitorErrorResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'AI summary for a watcher entity',
    },

    /** GET /api/monitor/entities/:id — articles matching a watcher entity. */
    entityResults: {
      method: 'GET',
      path: '/api/monitor/entities/:id',
      pathParams: z.object({ id: z.string() }),
      query: monitorLocaleQuerySchema,
      responses: {
        200: entityResultsResponseSchema,
        404: monitorErrorResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Articles for a watcher entity',
    },

    /** POST /api/monitor/refresh — user-triggered snapshot refresh. */
    refresh: {
      method: 'POST',
      path: '/api/monitor/refresh',
      body: c.noBody(),
      responses: {
        200: monitorRefreshResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Trigger a monitor refresh',
    },

    /** POST /api/internal/monitor/refresh — cron-triggered snapshot refresh. */
    internalRefresh: {
      method: 'POST',
      path: '/api/internal/monitor/refresh',
      body: c.noBody(),
      responses: {
        200: monitorRefreshResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Trigger a monitor refresh (admin token)',
    },

    /** POST /api/internal/monitor/sync-events — content-sync CI posts article events. */
    internalSyncEvents: {
      method: 'POST',
      path: '/api/internal/monitor/sync-events',
      body: internalSyncEventsBodySchema,
      responses: {
        200: internalSyncEventsResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Ingest content-sync article events (admin token)',
    },

    /** POST /api/internal/monitor/refresh-instagram — cron Instagram scrape. */
    internalRefreshInstagram: {
      method: 'POST',
      path: '/api/internal/monitor/refresh-instagram',
      body: c.noBody(),
      responses: {
        200: monitorInstagramRefreshResponseSchema,
        500: monitorErrorResponseSchema,
      },
      summary: 'Trigger an Instagram refresh (admin token)',
    },
  },
  { pathPrefix: '' }
);
