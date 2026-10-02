/**
 * ts-rest contract for FLUX image editing (single- and multi-reference).
 *
 * Covers:
 * - POST /api/image-edit
 *
 * Auth: requireAuth is applied at the mount prefix in routes.ts. The legacy
 * multipart route POST /api/flux/green-edit/prompt stays mounted for old
 * clients; new web callers go through this contract.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  imageEditBodySchema,
  imageEditElementsBodySchema,
  imageEditElementsSuccessSchema,
  imageEditSuccessSchema,
  imageEditErrorSchema,
  imageEditQuotaErrorSchema,
} from '../schemas/imageEdit.js';

const c = initContract();

export const imageEditContract = c.router(
  {
    /**
     * Edit an image with 1–10 reference images. images[0] is the primary
     * image; the instruction may reference "Bild N" / "image N" for the
     * N-th reference (FLUX multi-reference editing).
     */
    edit: {
      method: 'POST',
      path: '/api/image-edit',
      body: imageEditBodySchema,
      responses: {
        200: imageEditSuccessSchema,
        400: imageEditErrorSchema,
        401: imageEditErrorSchema,
        429: imageEditQuotaErrorSchema,
        500: imageEditErrorSchema,
        // The Bäume budget could not be checked (Redis down) — fail closed, retry later.
        503: imageEditErrorSchema,
      },
      summary: 'Edit an image with one or more reference images (FLUX)',
    },
    /**
     * Experimental: the visible elements of an image with FLUX 3 bounding
     * boxes, as the starting table of the box editor. Costs no tree budget.
     */
    elements: {
      method: 'POST',
      path: '/api/image-edit/elements',
      body: imageEditElementsBodySchema,
      responses: {
        200: imageEditElementsSuccessSchema,
        400: imageEditErrorSchema,
        401: imageEditErrorSchema,
        500: imageEditErrorSchema,
      },
      summary: 'Detect the elements of an image with bounding boxes (FLUX 3, experimental)',
    },
  },
  { pathPrefix: '' }
);
