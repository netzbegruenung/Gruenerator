/**
 * ts-rest contract for the external push-ingest API.
 *
 * Implemented in apps/api/routes/v1/pushIngestContractRouter.ts. This is the
 * versioned (`/api/v1`) machine boundary the `gruenerator-sync` WordPress plugin
 * builds against — it is the only coupling between the plugin and Grünerator, so
 * it must stay backward-compatible (additive changes only; breaking changes get a
 * new path).
 *
 * Middleware is applied at the prefix in routes.ts, not here:
 *   - /api/v1/push/* → requireApiKey + apiKeyRateLimit('push')
 */
import { initContract } from '@ts-rest/core';

import {
  pushDeleteBodySchema,
  pushDeleteResponseSchema,
  pushErrorSchema,
  pushIngestBodySchema,
  pushIngestResponseSchema,
  pushPingResponseSchema,
} from '../schemas/pushIngest.js';

const c = initContract();

export const pushIngestContract = c.router(
  {
    /** GET /api/v1/push/ping — verify the API key and report its scope. */
    ping: {
      method: 'GET',
      path: '/api/v1/push/ping',
      responses: {
        200: pushPingResponseSchema,
        401: pushErrorSchema,
      },
      summary: 'Verify API key and report its scope (plugin "test connection")',
    },

    /** POST /api/v1/push/articles — ingest one article (LV system collection or user notebook). */
    ingestArticle: {
      method: 'POST',
      path: '/api/v1/push/articles',
      body: pushIngestBodySchema,
      responses: {
        200: pushIngestResponseSchema,
        400: pushErrorSchema,
        401: pushErrorSchema,
        403: pushErrorSchema,
        404: pushErrorSchema,
        422: pushErrorSchema,
        500: pushErrorSchema,
      },
      summary: 'Ingest one article into a Landesverband collection or a user notebook',
    },

    /** POST /api/v1/push/articles/delete — remove a previously-pushed article by url. */
    deleteArticle: {
      method: 'POST',
      path: '/api/v1/push/articles/delete',
      body: pushDeleteBodySchema,
      responses: {
        200: pushDeleteResponseSchema,
        400: pushErrorSchema,
        401: pushErrorSchema,
        403: pushErrorSchema,
        404: pushErrorSchema,
        500: pushErrorSchema,
      },
      summary: 'Delete/unpublish a previously-pushed article by source url',
    },
  },
  { pathPrefix: '' }
);
