/**
 * ts-rest contracts for Parteitage: public archive (auth at /api/parteitage
 * prefix) and the instance-admin import/moderation surface.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  conventionDetailSchema,
  conventionEditorDataSchema,
  conventionSpeechDetailSchema,
  parteitageAdminListResponseSchema,
  parteitageErrorSchema,
  parteitageFileHashesSchema,
  parteitageImportBodySchema,
  parteitageImportResponseSchema,
  parteitageListResponseSchema,
  parteitageOkSchema,
  parteitageSpeechHiddenBodySchema,
  parteitageUnlockBodySchema,
  parteitageUpdateBodySchema,
} from '../schemas/parteitage.js';

const c = initContract();

const slugParams = z.object({ slug: z.string() });
const speechIdParams = z.object({ speechId: z.string() });
const idParams = z.object({ id: z.string() });

export const parteitageContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/parteitage',
      responses: {
        200: parteitageListResponseSchema,
        401: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'List Parteitage visible to the user',
    },
    get: {
      method: 'GET',
      path: '/api/parteitage/:slug',
      pathParams: slugParams,
      responses: {
        200: conventionDetailSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Get a Parteitag with stats and speeches',
    },
    unlock: {
      method: 'POST',
      path: '/api/parteitage/:slug/entsperren',
      pathParams: slugParams,
      body: parteitageUnlockBodySchema,
      responses: {
        200: parteitageOkSchema,
        401: parteitageErrorSchema,
        // WRONG_PASSWORD is 403, not 401: the web client treats a 401 as a dead session and replays the request.
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        429: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Unlock a password-protected Parteitag',
    },
    getSpeech: {
      method: 'GET',
      path: '/api/parteitage/reden/:speechId',
      pathParams: speechIdParams,
      responses: {
        200: conventionSpeechDetailSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Get one speech including transcript',
    },
    editorData: {
      method: 'GET',
      path: '/api/parteitage/reden/:speechId/editor',
      pathParams: speechIdParams,
      responses: {
        200: conventionEditorDataSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Hand-off data for loading a speech into the video editor',
    },
  },
  { pathPrefix: '' }
);

export const parteitageAdminContract = c.router(
  {
    listAll: {
      method: 'GET',
      path: '/api/admin/parteitage',
      responses: {
        200: parteitageAdminListResponseSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'List all Parteitage including drafts',
    },
    fileHashes: {
      method: 'GET',
      path: '/api/admin/parteitage/by-key/:key/files',
      pathParams: z.object({ key: z.string() }),
      responses: {
        200: parteitageFileHashesSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Stored sha256 to storage key map, for incremental imports',
    },
    import: {
      method: 'POST',
      path: '/api/admin/parteitage/import',
      body: parteitageImportBodySchema,
      responses: {
        200: parteitageImportResponseSchema,
        400: parteitageErrorSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        409: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Import a Parteitag manifest with previously uploaded files',
    },
    update: {
      method: 'PATCH',
      path: '/api/admin/parteitage/:id',
      pathParams: idParams,
      body: parteitageUpdateBodySchema,
      responses: {
        200: parteitageOkSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Change status or password of a Parteitag',
    },
    setSpeechHidden: {
      method: 'PATCH',
      path: '/api/admin/parteitage/reden/:speechId',
      pathParams: speechIdParams,
      body: parteitageSpeechHiddenBodySchema,
      responses: {
        200: parteitageOkSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Hide or unhide a speech',
    },
    deleteSpeech: {
      method: 'DELETE',
      path: '/api/admin/parteitage/reden/:speechId',
      pathParams: speechIdParams,
      body: c.noBody(),
      responses: {
        200: parteitageOkSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Delete a speech',
    },
    deleteConvention: {
      method: 'DELETE',
      path: '/api/admin/parteitage/:id',
      pathParams: idParams,
      body: c.noBody(),
      responses: {
        200: parteitageOkSchema,
        401: parteitageErrorSchema,
        403: parteitageErrorSchema,
        404: parteitageErrorSchema,
        500: parteitageErrorSchema,
      },
      summary: 'Delete a Parteitag with all speeches',
    },
  },
  { pathPrefix: '' }
);
