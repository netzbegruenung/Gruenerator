/**
 * ts-rest contract router for /api/transfer (non-upload endpoints)
 *
 * Covers:
 *   GET    /api/transfer/list     — list authenticated user's transfers
 *   DELETE /api/transfer/:token  — delete a transfer (owner only)
 *
 * SKIPPED: POST /api/transfer/upload — uses multer multipart file upload.
 *
 * Mount BEFORE the legacy transferRouter in routes.ts so ts-rest matches
 * its own routes first; POST /upload falls through to the legacy router.
 *
 * Authentication: all routes require authentication — requireAuth is applied
 * at the path prefix in routes.ts before this contract is mounted.
 */

import { transferContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { transferService } from '../../services/transferService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('transferContract');

function getUserId(req: Request): string | undefined {
  return (req.user as UserProfile | undefined)?.id;
}

const s = initServer();

export const transferContractRouter = s.router(transferContract, {
  listTransfers: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const transfers = await transferService.listUserTransfers(userId);

      return {
        status: 200 as const,
        body: {
          success: true,
          transfers: transfers.map((t) => ({
            id: t.id,
            shareToken: t.share_token,
            fileName: t.file_name ?? null,
            fileSize: t.file_size ?? null,
            mimeType: t.mime_type,
            downloadCount: t.download_count,
            createdAt: t.created_at,
            expiresAt: t.expires_at ?? null,
            isPasswordProtected: !!t.password_hash,
          })),
        },
      };
    } catch (error) {
      log.error('[transferContract.listTransfers] Error:', { error });
      return { status: 500 as const, body: { error: 'Fehler beim Laden der Transfers' } };
    }
  },

  deleteTransfer: async (args) => {
    try {
      const userId = getUserId(args.req);
      if (!userId) {
        return { status: 401 as const, body: { error: 'Nicht authentifiziert' } };
      }

      const deleted = await transferService.deleteTransfer(userId, args.params.token);

      if (!deleted) {
        return { status: 404 as const, body: { error: 'Transfer nicht gefunden' } };
      }

      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[transferContract.deleteTransfer] Error:', { error });
      return { status: 500 as const, body: { error: 'Fehler beim Löschen des Transfers' } };
    }
  },
});

/**
 * Mount the transfer contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy transferRouter.
 *
 * `requireAuth` MUST be applied at the prefix in routes.ts before calling
 * this function — both routes require authentication.
 */
export function mountTransferContractRouter(app: Application): void {
  createExpressEndpoints(transferContract, transferContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'transferContract'),
  });
}
