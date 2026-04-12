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
  saveAsTemplateBodySchema,
  pushToPhoneBodySchema,
  createShareResponseSchema,
  updateImageShareResponseSchema,
  saveAsTemplateResponseSchema,
  pushToPhoneResponseSchema,
  shareErrorResponseSchema,
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
        403: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Update an image share',
    },

    /**
     * POST /api/share/:shareToken/save-as-template
     * Promote an existing share to a template.
     */
    saveAsTemplate: {
      method: 'POST',
      path: '/api/share/:shareToken/save-as-template',
      pathParams: z.object({ shareToken: z.string() }),
      body: saveAsTemplateBodySchema,
      responses: {
        200: saveAsTemplateResponseSchema,
        403: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Save a share as a template',
    },

    /**
     * POST /api/share/push-to-phone
     * Send a share to the user's mobile device via push notification.
     */
    pushToPhone: {
      method: 'POST',
      path: '/api/share/push-to-phone',
      body: pushToPhoneBodySchema,
      responses: {
        200: pushToPhoneResponseSchema,
        403: shareErrorResponseSchema,
        404: shareErrorResponseSchema,
        500: shareErrorResponseSchema,
      },
      summary: 'Push a share to a mobile device',
    },
  },
  { pathPrefix: '' }
);
