/**
 * ts-rest router for POST /api/media/import-upload. requireAuth and the rate
 * limiter sit at the `/api/media/import-upload` prefix in routes.ts; every
 * logged-in person may import their own finished uploads (no admin gate).
 */
import { mediaImportContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { importUpload } from '../../services/media/uploadImport.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application } from 'express';

const log = createLogger('mediaImportContract');
const s = initServer();

export const mediaImportContractRouter = s.router(mediaImportContract, {
  importUpload: async ({ req, body }) => {
    const user = req.user as UserProfile | undefined;
    if (!user?.id) throw new Error('Authentication required');
    const result = await importUpload(user.id, body.uploadId, body.title ?? null);
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    return {
      status: 201 as const,
      body: {
        mediaId: result.mediaId,
        shareToken: result.shareToken,
        shareUrl: `/share/${result.shareToken}`,
        mediaType: result.mediaType,
        title: result.title,
        durationSeconds: result.durationSeconds,
      },
    };
  },
});

export function mountMediaImportContractRouter(app: Application): void {
  createExpressEndpoints(mediaImportContract, mediaImportContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'mediaImportContract'),
  });
}
