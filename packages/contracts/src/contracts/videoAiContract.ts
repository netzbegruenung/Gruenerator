/**
 * ts-rest contract for the KI-Schnitt. Mounted behind requireAuth; the work
 * happens in apps/api/services/videoAi/videoAiWorker.ts and the page polls `get`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createVideoAiProjectBodySchema,
  createVideoAiProjectResponseSchema,
  videoAiErrorSchema,
  videoAiProjectDtoSchema,
  videoAiProjectListItemSchema,
} from '../schemas/videoAi.js';

const c = initContract();

export const videoAiContract = c.router(
  {
    /** Checks the material, books the trees and queues the job. */
    create: {
      method: 'POST',
      path: '/api/video-ai/projects',
      body: createVideoAiProjectBodySchema,
      responses: {
        202: createVideoAiProjectResponseSchema,
        400: videoAiErrorSchema,
        409: videoAiErrorSchema,
        429: videoAiErrorSchema,
        503: videoAiErrorSchema,
      },
      summary: 'Queue a KI-Schnitt from Mediathek items',
    },
    list: {
      method: 'GET',
      path: '/api/video-ai/projects',
      responses: {
        200: z.object({ projects: z.array(videoAiProjectListItemSchema) }),
      },
      summary: 'List own KI-Schnitt projects',
    },
    /** :ref = slug suffix or raw uuid */
    get: {
      method: 'GET',
      path: '/api/video-ai/projects/:ref',
      pathParams: z.object({ ref: z.string().min(1).max(200) }),
      responses: {
        200: videoAiProjectDtoSchema,
        404: videoAiErrorSchema,
      },
      summary: 'Get an own KI-Schnitt project',
    },
    /** Stops a queued or running job; what was analysed so far stays. */
    cancel: {
      method: 'POST',
      path: '/api/video-ai/projects/:id/cancel',
      pathParams: z.object({ id: z.string().guid() }),
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.literal(true) }),
        404: videoAiErrorSchema,
        409: videoAiErrorSchema,
      },
      summary: 'Cancel a running KI-Schnitt',
    },
    remove: {
      method: 'DELETE',
      path: '/api/video-ai/projects/:id',
      pathParams: z.object({ id: z.string().guid() }),
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.literal(true) }),
        404: videoAiErrorSchema,
      },
      summary: 'Move a KI-Schnitt project to the Papierkorb',
    },
  },
  { pathPrefix: '' }
);
