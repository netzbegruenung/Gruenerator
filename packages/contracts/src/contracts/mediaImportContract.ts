/**
 * ts-rest contract for taking a finished resumable upload into the Mediathek.
 *
 * Flow for any client: create a tus upload at `/api/uploads` (metadata
 * `filename`, `filetype`; the server records who created it), PATCH the bytes
 * in chunks, then POST the upload id here. requireAuth sits at the
 * `/api/media/import-upload` prefix in routes.ts.
 */
import { initContract } from '@ts-rest/core';

import {
  importMediaUploadBodySchema,
  importMediaUploadResponseSchema,
  mediaImportErrorSchema,
} from '../schemas/mediaImport.js';

const c = initContract();

export const mediaImportContract = c.router({
  importUpload: {
    method: 'POST',
    path: '/api/media/import-upload',
    body: importMediaUploadBodySchema,
    responses: {
      201: importMediaUploadResponseSchema,
      400: mediaImportErrorSchema,
      /** Unknown upload id, or one another person created. */
      404: mediaImportErrorSchema,
      /** Upload not complete yet, or already being imported. */
      409: mediaImportErrorSchema,
    },
    summary: 'Take a finished resumable upload into the Mediathek',
  },
});
