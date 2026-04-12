/**
 * ts-rest contract for file transfer endpoints.
 *
 * Covers the non-file-upload routes in:
 * - apps/api/routes/transfer/transferController.ts
 *
 * SKIPPED: POST /upload — uses multer multipart file upload (file upload
 * hard rule). This route is NOT modelled here.
 *
 * All routes require authentication (requireAuth in routes.ts).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  transferListResponseSchema,
  transferDeleteResponseSchema,
  transferErrorSchema,
} from '../schemas/transfer.js';

const c = initContract();

export const transferContract = c.router(
  {
    /**
     * GET /api/transfer/list
     * Returns the authenticated user's transfer history.
     */
    listTransfers: {
      method: 'GET',
      path: '/api/transfer/list',
      responses: {
        200: transferListResponseSchema,
        401: transferErrorSchema,
        500: transferErrorSchema,
      },
      summary: "List the authenticated user's transfers",
    },

    /**
     * DELETE /api/transfer/:token
     * Delete a transfer (owner only).
     */
    deleteTransfer: {
      method: 'DELETE',
      path: '/api/transfer/:token',
      pathParams: z.object({ token: z.string() }),
      body: c.noBody(),
      responses: {
        200: transferDeleteResponseSchema,
        401: transferErrorSchema,
        404: transferErrorSchema,
        500: transferErrorSchema,
      },
      summary: 'Delete a transfer (owner only)',
    },
  },
  { pathPrefix: '' }
);
