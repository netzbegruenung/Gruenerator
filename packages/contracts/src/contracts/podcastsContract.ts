/**
 * ts-rest contract for podcasts. Mounted behind requireAuth; the audio itself
 * is a Mediathek share and streams through /api/share/:token.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createPodcastBodySchema,
  createPodcastResponseSchema,
  podcastDtoSchema,
  podcastErrorSchema,
} from '../schemas/podcasts.js';

const c = initContract();

export const podcastsContract = c.router(
  {
    /** POST /api/podcasts — queues the job; the page polls `get`. */
    create: {
      method: 'POST',
      path: '/api/podcasts',
      body: createPodcastBodySchema,
      responses: {
        202: createPodcastResponseSchema,
        429: podcastErrorSchema,
        503: podcastErrorSchema,
      },
      summary: 'Queue a two-voice podcast from a text',
    },
    /** :ref = slug suffix (from /podcast/<slug>-<suffix>) or raw uuid */
    get: {
      method: 'GET',
      path: '/api/podcasts/:ref',
      pathParams: z.object({ ref: z.string().min(1).max(200) }),
      responses: {
        200: podcastDtoSchema,
        404: podcastErrorSchema,
      },
      summary: 'Get an own podcast',
    },
    /** Puts a failed podcast back in the queue; a written script is kept. */
    retry: {
      method: 'POST',
      path: '/api/podcasts/:id/retry',
      pathParams: z.object({ id: z.string().uuid() }),
      body: c.noBody(),
      responses: {
        202: z.object({ id: z.string().uuid() }),
        404: podcastErrorSchema,
        409: podcastErrorSchema,
      },
      summary: 'Retry a failed podcast',
    },
    remove: {
      method: 'DELETE',
      path: '/api/podcasts/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.literal(true) }),
        404: podcastErrorSchema,
      },
      summary: 'Move a podcast to the Papierkorb',
    },
  },
  { pathPrefix: '' }
);
