/**
 * ts-rest contract for /api/documents (Qdrant, retrieval, Wolke sync).
 *
 * Covers the validateBody routes from:
 *   - apps/api/routes/documents/qdrantController.ts    → GET /system-full-text
 *   - apps/api/routes/documents/retrievalController.ts → GET /stats
 *   - apps/api/routes/documents/wolkeController.ts     → GET /sync-status
 *
 * All routes require authentication — `requireAuth` is applied at the prefix
 * in routes.ts before this contract is mounted.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  systemFullTextResponseSchema,
  systemFullTextNotFoundSchema,
  systemFullTextErrorSchema,
  documentStatsResponseSchema,
  documentStatsErrorSchema,
  syncStatusResponseSchema,
  syncStatusErrorSchema,
  documentsAuthErrorSchema,
  documentsValidationErrorSchema,
  documentStatusesRequestSchema,
  documentStatusesResponseSchema,
  documentContentResponseSchema,
  documentContentErrorSchema,
} from '../schemas/documents.js';

const c = initContract();

export const documentsContract = c.router(
  {
    /**
     * GET /api/documents/system-full-text?url=...&collection=...
     * Retrieve full text for a system-collection document by URL.
     * No PostgreSQL ownership check — system documents are public party content.
     */
    systemFullText: {
      method: 'GET',
      path: '/api/documents/system-full-text',
      query: c.type<{ url?: string; collection?: string }>(),
      responses: {
        200: systemFullTextResponseSchema,
        400: documentsValidationErrorSchema,
        401: documentsAuthErrorSchema,
        404: systemFullTextNotFoundSchema,
        500: systemFullTextErrorSchema,
      },
      summary: 'Get full text of a system-collection document by URL',
    },

    /**
     * GET /api/documents/stats
     * Get document statistics for the authenticated user.
     */
    getStats: {
      method: 'GET',
      path: '/api/documents/stats',
      responses: {
        200: documentStatsResponseSchema,
        401: documentsAuthErrorSchema,
        500: documentStatsErrorSchema,
      },
      summary: 'Get document statistics for the current user',
    },

    /**
     * GET /api/documents/sync-status
     * Get Wolke sync status for the authenticated user.
     */
    getSyncStatus: {
      method: 'GET',
      path: '/api/documents/sync-status',
      responses: {
        200: syncStatusResponseSchema,
        401: documentsAuthErrorSchema,
        500: syncStatusErrorSchema,
      },
      summary: 'Get Wolke sync status for the current user',
    },

    /**
     * GET /api/documents/:id/content
     * Metadata + full OCR text for a single owned document.
     */
    getContent: {
      method: 'GET',
      path: '/api/documents/:id/content',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: documentContentResponseSchema,
        401: documentsAuthErrorSchema,
        404: documentContentErrorSchema,
        500: documentContentErrorSchema,
      },
      summary: 'Get a document’s metadata and full OCR text',
    },

    /**
     * POST /api/documents/statuses
     * Look up the current `status` of multiple documents in one call.
     * Used by the notebook-creation dialog to poll progress while the
     * backend processes uploads in the background. POST (not GET) because
     * the IDs list can be long and Zod-validating a body is simpler than
     * a comma-separated querystring.
     */
    getDocumentStatuses: {
      method: 'POST',
      path: '/api/documents/statuses',
      body: documentStatusesRequestSchema,
      responses: {
        200: documentStatusesResponseSchema,
        401: documentsAuthErrorSchema,
        500: documentsValidationErrorSchema,
      },
      summary: 'Get status of multiple documents for progress polling',
    },
  },
  { pathPrefix: '' }
);
