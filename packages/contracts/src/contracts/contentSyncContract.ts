/**
 * ts-rest contract for the internal content-sync endpoint.
 *
 * Covers the routes implemented in
 * apps/api/routes/internal/contentSyncContractRouter.ts.
 *
 * Middleware (applied at the prefix in routes.ts, not here):
 *   - /api/internal/content-sync/* → requireAdminToken
 *
 * The `:sourceId` param is validated against `contentSyncSourceSchema`, so an
 * unknown source is rejected with a 400 by ts-rest's request validation before
 * the handler runs — the old hand-rolled `VALID_SOURCES.includes()` check.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  contentStatsResponseSchema,
  contentSyncAcceptedSchema,
  contentSyncBusyResponseSchema,
  contentSyncFailureSchema,
  contentSyncJobNotFoundSchema,
  contentSyncJobStatusSchema,
  contentSyncRequestSchema,
  contentSyncResultSchema,
  contentSyncSourceSchema,
  contentSyncSourcesResponseSchema,
} from '../schemas/contentSync.js';

const c = initContract();

export const contentSyncContract = c.router(
  {
    /** POST /api/internal/content-sync/source/:sourceId — trigger a scraper run. */
    syncSource: {
      method: 'POST',
      path: '/api/internal/content-sync/source/:sourceId',
      pathParams: z.object({ sourceId: contentSyncSourceSchema }),
      // Optional — n8n's existing calls send no body at all.
      body: contentSyncRequestSchema.optional(),
      responses: {
        200: contentSyncResultSchema,
        202: contentSyncAcceptedSchema,
        409: contentSyncBusyResponseSchema,
        500: contentSyncFailureSchema,
      },
      summary: 'Trigger a content sync for one source (admin token)',
    },

    /** GET /api/internal/content-sync/jobs/:jobId — poll a `background: true` run. */
    getSyncJob: {
      method: 'GET',
      path: '/api/internal/content-sync/jobs/:jobId',
      pathParams: z.object({ jobId: z.string().uuid() }),
      responses: {
        200: contentSyncJobStatusSchema,
        404: contentSyncJobNotFoundSchema,
      },
      summary: 'Status/result of a background content-sync job (admin token)',
    },

    /** GET /api/internal/content-sync/sources — list triggerable source ids. */
    listSources: {
      method: 'GET',
      path: '/api/internal/content-sync/sources',
      responses: {
        200: contentSyncSourcesResponseSchema,
      },
      summary: 'List valid content-sync source ids (admin token)',
    },

    /** GET /api/internal/content-sync/stats — live-rendered content-stats docs page. */
    getStats: {
      method: 'GET',
      path: '/api/internal/content-sync/stats',
      responses: {
        200: contentStatsResponseSchema,
      },
      summary: 'Render the content-stats docs page from live Qdrant counts (admin token)',
    },
  },
  { pathPrefix: '' }
);
