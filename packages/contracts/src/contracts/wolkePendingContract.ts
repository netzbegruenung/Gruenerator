/**
 * ts-rest contract for the Wolke folder watcher's pending-files endpoints.
 *
 * These hang off the notebook-collections prefix (`/:id/pending-files/...`) and
 * are owner-scoped — auth is enforced by `requireAuth` at the prefix in routes.ts
 * before the contract is mounted. The extra `/pending-files` segment keeps these
 * routes from colliding with the `/:slugOrId` catch-all on notebookCollectionsContract.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { notebookErrorResponseSchema } from '../schemas/notebook.js';
import {
  listPendingFilesResponseSchema,
  addPendingFileResponseSchema,
  dismissPendingFileResponseSchema,
  setNotebookAutoSyncBodySchema,
  setNotebookAutoSyncResponseSchema,
} from '../schemas/wolkePending.js';

const c = initContract();

export const wolkePendingContract = c.router(
  {
    /**
     * GET /api/auth/notebook-collections/:id/pending-files
     * List files detected in the notebook's Wolke folders that are still pending.
     */
    listPendingFiles: {
      method: 'GET',
      path: '/api/auth/notebook-collections/:id/pending-files',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: listPendingFilesResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'List pending Wolke files detected for a notebook',
    },

    /**
     * POST /api/auth/notebook-collections/:id/pending-files/:pendingId/add
     * Import a pending file (download → OCR → embed) and attach it to the notebook.
     */
    addPendingFile: {
      method: 'POST',
      path: '/api/auth/notebook-collections/:id/pending-files/:pendingId/add',
      pathParams: z.object({ id: z.string(), pendingId: z.string() }),
      body: c.noBody(),
      responses: {
        200: addPendingFileResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        409: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Import a pending Wolke file and attach it to the notebook',
    },

    /**
     * POST /api/auth/notebook-collections/:id/pending-files/:pendingId/dismiss
     * Dismiss a pending file so it is no longer offered (and not re-detected).
     */
    dismissPendingFile: {
      method: 'POST',
      path: '/api/auth/notebook-collections/:id/pending-files/:pendingId/dismiss',
      pathParams: z.object({ id: z.string(), pendingId: z.string() }),
      body: c.noBody(),
      responses: {
        200: dismissPendingFileResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Dismiss a pending Wolke file',
    },

    /**
     * POST /api/auth/notebook-collections/:id/auto-sync
     * Toggle hourly watching for a notebook's Wolke folders. Sets the
     * collection's `auto_sync` flag, which the hourly watcher enumerates.
     */
    setNotebookAutoSync: {
      method: 'POST',
      path: '/api/auth/notebook-collections/:id/auto-sync',
      pathParams: z.object({ id: z.string() }),
      body: setNotebookAutoSyncBodySchema,
      responses: {
        200: setNotebookAutoSyncResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Toggle hourly Wolke watching for a notebook',
    },
  },
  { pathPrefix: '' }
);
