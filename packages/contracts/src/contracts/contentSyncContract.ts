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
  contentSyncBusyResponseSchema,
  contentSyncFailureSchema,
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
      body: c.noBody(),
      responses: {
        200: contentSyncResultSchema,
        409: contentSyncBusyResponseSchema,
        500: contentSyncFailureSchema,
      },
      summary: 'Trigger a content sync for one source (admin token)',
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
  },
  { pathPrefix: '' }
);
