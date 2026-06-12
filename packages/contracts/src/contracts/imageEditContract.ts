/**
 * ts-rest contract for FLUX.2 image editing (single- and multi-reference).
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
  imageEditSuccessSchema,
  imageEditErrorSchema,
  imageEditQuotaErrorSchema,
} from '../schemas/imageEdit.js';

const c = initContract();

export const imageEditContract = c.router(
  {
    /**
     * Edit an image with 1–8 reference images. images[0] is the primary
     * image; the instruction may reference "Bild N" / "image N" for the
     * N-th reference (FLUX.2 multi-reference editing).
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
        500: z.object({ success: z.literal(false), error: z.string() }),
      },
      summary: 'Edit an image with one or more reference images (FLUX.2)',
    },
  },
  { pathPrefix: '' }
);
