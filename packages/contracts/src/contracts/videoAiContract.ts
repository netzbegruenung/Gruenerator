/**
 * ts-rest contract for the KI-Schnitt. Mounted behind requireAuth; the work
 * happens in apps/api/services/videoAi/videoAiWorker.ts and the page polls `get`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  applyVideoAiOpsBodySchema,
  reviseVideoAiBodySchema,
  reviseVideoAiResponseSchema,
  videoAiTimelineSchema,
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
    /** Direct changes from the preview; free, no model. Creates a new version. */
    applyOps: {
      method: 'POST',
      path: '/api/video-ai/projects/:id/ops',
      pathParams: z.object({ id: z.string().guid() }),
      body: applyVideoAiOpsBodySchema,
      responses: {
        200: videoAiProjectDtoSchema,
        400: videoAiErrorSchema,
        404: videoAiErrorSchema,
        409: videoAiErrorSchema,
      },
      summary: 'Apply direct changes to a KI-Schnitt',
    },
    /** A correction round with Gemma; answers when the new version is stored. */
    revise: {
      method: 'POST',
      path: '/api/video-ai/projects/:id/revise',
      pathParams: z.object({ id: z.string().guid() }),
      body: reviseVideoAiBodySchema,
      responses: {
        200: reviseVideoAiResponseSchema,
        404: videoAiErrorSchema,
        409: videoAiErrorSchema,
        429: videoAiErrorSchema,
        503: videoAiErrorSchema,
      },
      summary: 'Revise a KI-Schnitt from feedback',
    },
    selectVersion: {
      method: 'POST',
      path: '/api/video-ai/projects/:id/versions/:version/select',
      pathParams: z.object({ id: z.string().guid(), version: z.coerce.number().int().min(1) }),
      body: c.noBody(),
      responses: {
        200: videoAiProjectDtoSchema,
        404: videoAiErrorSchema,
        409: videoAiErrorSchema,
      },
      summary: 'Go back to an earlier version',
    },
    /** "Im Editor weiterbearbeiten": ends the correction rounds. */
    handOff: {
      method: 'POST',
      path: '/api/video-ai/projects/:id/hand-off',
      pathParams: z.object({ id: z.string().guid() }),
      body: c.noBody(),
      responses: {
        200: videoAiProjectDtoSchema,
        404: videoAiErrorSchema,
        409: videoAiErrorSchema,
      },
      summary: 'Hand a KI-Schnitt over to the editor',
    },
    /** The compiled plan for the editor; `version` defaults to the current one. */
    timeline: {
      method: 'GET',
      path: '/api/video-ai/projects/:id/timeline',
      pathParams: z.object({ id: z.string().guid() }),
      query: z.object({ version: z.coerce.number().int().min(1).optional() }),
      responses: {
        200: videoAiTimelineSchema,
        404: videoAiErrorSchema,
        409: videoAiErrorSchema,
      },
      summary: 'Get the compiled timeline of a KI-Schnitt version',
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
