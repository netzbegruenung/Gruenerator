/**
 * ts-rest contract for video render endpoints.
 *
 * Covers:
 *   apps/api/routes/video/renderController.ts — render CRUD
 *
 * Mount prefix: /api/video
 *
 * All routes require authentication (enforced at prefix in routes.ts).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  renderBodySchema,
  renderCreateResponseSchema,
  renderStatusResponseSchema,
  renderCancelResponseSchema,
  videoErrorResponseSchema,
} from '../schemas/video.js';

const c = initContract();

export const videoContract = c.router(
  {
    /**
     * POST /api/video/render
     * Create a new render job. Stores the design in Redis and queues for the
     * Remotion worker.
     */
    createRender: {
      method: 'POST',
      path: '/api/video/render',
      body: renderBodySchema,
      responses: {
        200: renderCreateResponseSchema,
        400: videoErrorResponseSchema,
        500: videoErrorResponseSchema,
      },
      summary: 'Create a video render job',
    },

    /**
     * GET /api/video/render/:id
     * Poll for render job status.
     */
    getRender: {
      method: 'GET',
      path: '/api/video/render/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: renderStatusResponseSchema,
        404: videoErrorResponseSchema,
        500: videoErrorResponseSchema,
      },
      summary: 'Get render job status',
    },

    /**
     * DELETE /api/video/render/:id
     * Cancel a render job.
     */
    cancelRender: {
      method: 'DELETE',
      path: '/api/video/render/:id',
      pathParams: z.object({ id: z.string() }),
      body: c.noBody(),
      responses: {
        200: renderCancelResponseSchema,
        400: videoErrorResponseSchema,
        404: videoErrorResponseSchema,
        500: videoErrorResponseSchema,
      },
      summary: 'Cancel a render job',
    },
  },
  { pathPrefix: '' }
);
