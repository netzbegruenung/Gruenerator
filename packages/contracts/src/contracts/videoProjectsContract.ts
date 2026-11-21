/**
 * ts-rest contract for video editor projects (`/api/video-projects`).
 * requireAuth + authenticatedReadLimiter run on the prefix in routes.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createVideoProjectBodySchema,
  createVideoProjectResponseSchema,
  deleteVideoProjectResponseSchema,
  updateVideoProjectBodySchema,
  videoProjectErrorResponseSchema,
  videoProjectListResponseSchema,
  videoProjectSchema,
} from '../schemas/videoProjects.js';

const c = initContract();

export const videoProjectsContract = c.router({
  /** GET /api/video-projects — projects owned by, shared with, or group-shared to the caller. */
  list: {
    method: 'GET',
    path: '/api/video-projects',
    responses: {
      200: videoProjectListResponseSchema,
      401: videoProjectErrorResponseSchema,
      500: videoProjectErrorResponseSchema,
    },
    summary: 'List the current user video projects',
  },

  /** POST /api/video-projects — create (idempotent per `source_ref`). */
  create: {
    method: 'POST',
    path: '/api/video-projects',
    body: createVideoProjectBodySchema,
    responses: {
      201: createVideoProjectResponseSchema,
      400: videoProjectErrorResponseSchema,
      401: videoProjectErrorResponseSchema,
      500: videoProjectErrorResponseSchema,
    },
    summary: 'Create a video project',
  },

  /** GET /api/video-projects/:ref — `ref` is a slug or a UUID. */
  get: {
    method: 'GET',
    path: '/api/video-projects/:ref',
    pathParams: z.object({ ref: z.string() }),
    responses: {
      200: videoProjectSchema,
      401: videoProjectErrorResponseSchema,
      404: videoProjectErrorResponseSchema,
      500: videoProjectErrorResponseSchema,
    },
    summary: 'Get a video project by slug or id',
  },

  update: {
    method: 'PATCH',
    path: '/api/video-projects/:id',
    pathParams: z.object({ id: z.string() }),
    body: updateVideoProjectBodySchema,
    responses: {
      200: videoProjectSchema,
      400: videoProjectErrorResponseSchema,
      401: videoProjectErrorResponseSchema,
      403: videoProjectErrorResponseSchema,
      404: videoProjectErrorResponseSchema,
      500: videoProjectErrorResponseSchema,
    },
    summary: 'Rename a video project or change its aspect ratio',
  },

  delete: {
    method: 'DELETE',
    path: '/api/video-projects/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: deleteVideoProjectResponseSchema,
      401: videoProjectErrorResponseSchema,
      403: videoProjectErrorResponseSchema,
      404: videoProjectErrorResponseSchema,
      500: videoProjectErrorResponseSchema,
    },
    summary: 'Move a video project to the Papierkorb',
  },
});
