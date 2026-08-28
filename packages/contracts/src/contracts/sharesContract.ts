/**
 * ts-rest contract for /api/share
 *
 * Covers the validateBody-guarded endpoints in shareController.ts.
 * File-streaming endpoints (preview, download, thumbnail, original) are
 * left in the legacy Express router — ts-rest cannot handle raw streams.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createImageShareBodySchema,
  createVideoShareBodySchema,
  createVideoFromProjectBodySchema,
  updateImageShareBodySchema,
  createShareResponseSchema,
  updateImageShareResponseSchema,
  shareErrorResponseSchema,
  mySharesQuerySchema,
  recentSharesQuerySchema,
  shareListResponseSchema,
  shareListSimpleResponseSchema,
  deleteShareResponseSchema,
  renameShareBodySchema,
} from '../schemas/shares.js';

const c = initContract();

export const sharesContract = c.router(
  {
    /**
     * POST /api/share/image
     * Create a new image share from base64 data.
     */
    createImageShare: {
      method: 'POST',
      path: '/api/share/image',
      body: createImageShareBodySchema,
      responses: {
        200: createShareResponseSchema,
        401: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Create an image share',
    },

    /**
     * POST /api/share/video
     * Create a video share from a completed export token.
     */
    createVideoShare: {
      method: 'POST',
      path: '/api/share/video',
      body: createVideoShareBodySchema,
      responses: {
        200: createShareResponseSchema,
        400: shareErrorResponseSchema,
        401: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Create a video share from export token',
    },

    /**
     * POST /api/share/video/from-project
     * Create a video share directly from a subtitle project.
     */
    createVideoFromProject: {
      method: 'POST',
      path: '/api/share/video/from-project',
      body: createVideoFromProjectBodySchema,
      responses: {
        200: createShareResponseSchema,
        400: shareErrorResponseSchema,
        401: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Create a video share from a project',
    },

    /**
     * PUT /api/share/:shareToken/image
     * Update an existing image share with new image data.
     */
    updateImageShare: {
      method: 'PUT',
      path: '/api/share/:shareToken/image',
      pathParams: z.object({ shareToken: z.string() }),
      body: updateImageShareBodySchema,
      responses: {
        200: updateImageShareResponseSchema,
        400: shareErrorResponseSchema,
        401: shareErrorResponseSchema,
        403: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Update an image share',
    },
  },
  { pathPrefix: '' }
);

/**
 * ts-rest contract for /api/share read + management endpoints.
 *
 * Auth is enforced inside each handler (the /api/share prefix uses optionalAuth
 * so public file-streaming routes stay reachable). Route keys are ordered with
 * specific paths before parameterized ones; the public GET /:shareToken info
 * route and the file-streaming routes deliberately stay in the legacy Express
 * router (rate-limited, stream/range bodies ts-rest can't model).
 */
export const sharesReadContract = c.router(
  {
    /** PUT /api/share/:shareToken/publish — promote a draft to ready. */
    publishShare: {
      method: 'PUT',
      path: '/api/share/:shareToken/publish',
      pathParams: z.object({ shareToken: z.string() }),
      body: z.object({}).passthrough(),
      responses: {
        200: createShareResponseSchema,
        401: shareErrorResponseSchema,
        403: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Publish a draft share',
    },

    /** GET /api/share/my — list the user's shares. */
    listMyShares: {
      method: 'GET',
      path: '/api/share/my',
      query: mySharesQuerySchema,
      responses: {
        200: shareListResponseSchema,
        401: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: "List the user's shares",
    },

    /** GET /api/share/recent — recent image shares. */
    recentShares: {
      method: 'GET',
      path: '/api/share/recent',
      query: recentSharesQuerySchema,
      responses: {
        200: shareListResponseSchema,
        401: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'List recent image shares',
    },

    /** GET /api/share/my/images — the user's image shares. */
    listMyImages: {
      method: 'GET',
      path: '/api/share/my/images',
      responses: {
        200: shareListSimpleResponseSchema,
        401: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: "List the user's image shares",
    },

    /** GET /api/share/my/videos — the user's video shares. */
    listMyVideos: {
      method: 'GET',
      path: '/api/share/my/videos',
      responses: {
        200: shareListSimpleResponseSchema,
        401: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: "List the user's video shares",
    },

    /** DELETE /api/share/:shareToken — delete a share. */
    deleteShare: {
      method: 'DELETE',
      path: '/api/share/:shareToken',
      pathParams: z.object({ shareToken: z.string() }),
      responses: {
        200: deleteShareResponseSchema,
        401: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Delete a share',
    },
    renameShare: {
      method: 'PATCH',
      path: '/api/share/:shareToken',
      pathParams: z.object({ shareToken: z.string() }),
      body: renameShareBodySchema,
      responses: {
        200: deleteShareResponseSchema,
        401: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Rename a share (title only)',
    },
  },
  { pathPrefix: '' }
);
