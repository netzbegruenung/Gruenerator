/**
 * ts-rest contract for the server render lane (`/api/video-render`).
 *
 * Mirrors apps/api/routes/videoRender/videoRenderContractRouter.ts. Auth sits
 * on the prefix in routes.ts; a job is only visible to the person who started it.
 */
import { initContract } from '@ts-rest/core';

import {
  videoRenderAvailabilityResponseSchema,
  videoRenderBodySchema,
  videoRenderErrorResponseSchema,
  videoRenderFileResponseSchema,
  videoRenderJobParamsSchema,
  videoRenderStartResponseSchema,
  videoRenderStatusResponseSchema,
} from '../schemas/videoRender.js';

const c = initContract();

const errors = {
  401: videoRenderErrorResponseSchema,
  500: videoRenderErrorResponseSchema,
  // The render service is not configured or not reachable.
  503: videoRenderErrorResponseSchema,
} as const;

export const videoRenderContract = c.router(
  {
    /** Listed before `/:id` so Express does not read it as a job id. */
    availability: {
      method: 'GET',
      path: '/api/video-render/availability',
      responses: {
        200: videoRenderAvailabilityResponseSchema,
        401: videoRenderErrorResponseSchema,
      },
      summary: 'Whether server rendering is configured',
    },
    /** Queue a render. */
    start: {
      method: 'POST',
      path: '/api/video-render',
      body: videoRenderBodySchema,
      responses: {
        202: videoRenderStartResponseSchema,
        // Too many renders of this person in flight.
        429: videoRenderErrorResponseSchema,
        ...errors,
      },
      summary: 'Start a server-side video render',
    },
    status: {
      method: 'GET',
      path: '/api/video-render/:id',
      pathParams: videoRenderJobParamsSchema,
      responses: {
        200: videoRenderStatusResponseSchema,
        404: videoRenderErrorResponseSchema,
        ...errors,
      },
      summary: 'Progress of a render',
    },
    /** Response: video/mp4 binary. Axios usage: `{ responseType: 'blob' }`. */
    file: {
      method: 'GET',
      path: '/api/video-render/:id/file',
      pathParams: videoRenderJobParamsSchema,
      responses: {
        200: videoRenderFileResponseSchema,
        404: videoRenderErrorResponseSchema,
        // Not finished yet.
        409: videoRenderErrorResponseSchema,
        ...errors,
      },
      summary: 'The finished MP4',
    },
  },
  { pathPrefix: '' }
);
