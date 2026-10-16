/**
 * ts-rest contract for the docs version history (/api/docs/:id/snapshots).
 *
 * Served by apps/api/routes/docs/docSnapshotsContractRouter.ts. `requireAuth`
 * runs at the /api/docs prefix before the mount (routes.ts). Reading needs read
 * access to the document; creating, renaming and restoring need write access
 * as Hocuspocus grants it (owner, owner/editor permission, editor share link,
 * group share with write).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createDocSnapshotBodySchema,
  createdDocSnapshotSchema,
  docSnapshotContentSchema,
  docSnapshotErrorSchema,
  docSnapshotListSchema,
  docSnapshotPreviewSchema,
  docSnapshotSuccessSchema,
  listDocSnapshotsQuerySchema,
  renameDocSnapshotBodySchema,
  restoreDocSnapshotBodySchema,
  restoredDocSnapshotSchema,
} from '../schemas/docSnapshots.js';

const c = initContract();

const documentParams = z.object({ id: z.string() });
const versionParams = z.object({ id: z.string(), version: z.coerce.number().int() });

export const docSnapshotsContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/docs/:id/snapshots',
      pathParams: documentParams,
      query: listDocSnapshotsQuerySchema,
      responses: {
        200: docSnapshotListSchema,
        401: docSnapshotErrorSchema,
        403: docSnapshotErrorSchema,
        404: docSnapshotErrorSchema,
        500: docSnapshotErrorSchema,
      },
      summary: 'List stored versions, newest first, one page at a time',
    },

    create: {
      method: 'POST',
      path: '/api/docs/:id/snapshots',
      pathParams: documentParams,
      body: createDocSnapshotBodySchema,
      responses: {
        201: createdDocSnapshotSchema,
        401: docSnapshotErrorSchema,
        403: docSnapshotErrorSchema,
        404: docSnapshotErrorSchema,
        500: docSnapshotErrorSchema,
      },
      summary: 'Save the live document as a version',
    },

    getContent: {
      method: 'GET',
      path: '/api/docs/:id/snapshots/:version/content',
      pathParams: versionParams,
      responses: {
        200: docSnapshotContentSchema,
        401: docSnapshotErrorSchema,
        403: docSnapshotErrorSchema,
        404: docSnapshotErrorSchema,
        500: docSnapshotErrorSchema,
      },
      summary: 'Raw Yjs state of a version',
    },

    getPreview: {
      method: 'GET',
      path: '/api/docs/:id/snapshots/:version/preview',
      pathParams: versionParams,
      responses: {
        200: docSnapshotPreviewSchema,
        401: docSnapshotErrorSchema,
        403: docSnapshotErrorSchema,
        404: docSnapshotErrorSchema,
        500: docSnapshotErrorSchema,
      },
      summary: 'HTML preview of a version (tabs loaded before the BlockNote history)',
    },

    rename: {
      method: 'PUT',
      path: '/api/docs/:id/snapshots/:version',
      pathParams: versionParams,
      body: renameDocSnapshotBodySchema,
      responses: {
        200: docSnapshotSuccessSchema,
        401: docSnapshotErrorSchema,
        403: docSnapshotErrorSchema,
        404: docSnapshotErrorSchema,
        500: docSnapshotErrorSchema,
      },
      summary: 'Name or rename a version; null clears the name',
    },

    restore: {
      method: 'POST',
      path: '/api/docs/:id/snapshots/:version/restore',
      pathParams: versionParams,
      body: restoreDocSnapshotBodySchema,
      responses: {
        200: restoredDocSnapshotSchema,
        401: docSnapshotErrorSchema,
        403: docSnapshotErrorSchema,
        404: docSnapshotErrorSchema,
        500: docSnapshotErrorSchema,
      },
      summary: 'Restore a version; saves the current content first',
    },
  },
  { strictStatusCodes: true }
);
