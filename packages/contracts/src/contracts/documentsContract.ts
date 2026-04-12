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
  },
  { pathPrefix: '' }
);
