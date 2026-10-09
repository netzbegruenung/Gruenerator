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
    get: {
      method: 'GET',
      path: '/api/podcasts/:id',
      pathParams: z.object({ id: z.string().uuid() }),
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
        202: createPodcastResponseSchema,
        404: podcastErrorSchema,
        409: podcastErrorSchema,
      },
      summary: 'Retry a failed podcast',
    },
  },
  { pathPrefix: '' }
);
