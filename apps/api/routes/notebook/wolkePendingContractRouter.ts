/**
 * ts-rest contract router for the Wolke folder watcher's pending-files endpoints.
 *
 * Hangs off /api/auth/notebook-collections/:id/pending-files. Mount alongside
 * notebookCollectionsContractRouter in routes.ts (requireAuth applied at the
 * prefix, so req.user is always present).
 *
 * The actual file import reuses WolkeSyncService.processFile — no download/OCR/
 * embed logic is reimplemented here. Pending rows store the OWNER's userId
 * (the Wolke share link belongs to them), so import runs as the owner while the
 * access guard checks the calling user's edit rights.
 */
import {
  wolkePendingContract,
  type WolkePendingFileDto,
  type WolkePendingStatus,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { and, eq } from 'drizzle-orm';

import {
  documents,
  wolkePendingFiles,
  type WolkePendingFileRow,
} from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getWolkeSyncService } from '../../services/sync/WolkeSyncService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { requireNotebookEdit } from './notebookAccess.js';

import type { NextcloudFile } from '../../services/sync/types.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('wolkePendingContractRouter');
const notebookHelper = new NotebookQdrantHelper();
const sync = getWolkeSyncService();

/** Safety guard — requireAuth at the prefix guarantees req.user is set. */
function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

/** Map a Drizzle row to the snake_case contract DTO. */
function toDto(row: WolkePendingFileRow): WolkePendingFileDto {
  return {
    id: row.id,
    collection_id: row.collectionId,
    share_link_id: row.shareLinkId,
    folder_path: row.folderPath,
    file_path: row.filePath,
    file_name: row.fileName,
    etag: row.etag,
    size: row.size,
    mime_type: row.mimeType,
    // `status` is a TEXT column; the closed set is enforced everywhere it is
    // written. Boundary cast from the DB string to the contract enum.
    status: row.status as WolkePendingStatus,
    detected_at: row.detectedAt.toISOString(),
    resolved_at: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

const s = initServer();

export const wolkePendingContractRouter = s.router(wolkePendingContract, {
  listPendingFiles: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = args.params.id;

      const guard = await requireNotebookEdit(collectionId, userId);
      if (guard) return guard;

      const db = getDrizzleInstance();
      const rows = await db
        .select()
        .from(wolkePendingFiles)
        .where(
          and(
            eq(wolkePendingFiles.collectionId, collectionId),
            eq(wolkePendingFiles.status, 'pending')
          )
        );

      return { status: 200 as const, body: { pending: rows.map(toDto) } };
    } catch (error) {
      log.error('[wolkePendingContract.listPendingFiles] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  addPendingFile: async (args) => {
    try {
      const callingUserId = getUserId(args.req);
      const collectionId = args.params.id;

      const guard = await requireNotebookEdit(collectionId, callingUserId);
      if (guard) return guard;

      const db = getDrizzleInstance();
      const [row] = await db
        .select()
        .from(wolkePendingFiles)
        .where(
          and(
            eq(wolkePendingFiles.id, args.params.pendingId),
            eq(wolkePendingFiles.collectionId, collectionId)
          )
        )
        .limit(1);

      if (!row) {
        return { status: 404 as const, body: { error: 'Datei nicht gefunden' } };
      }
      if (row.status !== 'pending') {
        return { status: 409 as const, body: { error: 'Datei wurde bereits verarbeitet' } };
      }

      // Import runs as the OWNER (row.userId) — the share link is theirs.
      const shareLink = await sync.getShareLink(row.userId, row.shareLinkId);
      const file: NextcloudFile = {
        name: row.fileName,
        href: row.filePath,
        size: row.size ?? 0,
        ...(row.etag ? { etag: row.etag } : {}),
      };
      const result = await sync.processFile(row.userId, row.shareLinkId, file, shareLink);

      let documentId = result.documentId ?? null;
      // Race: the file was imported (e.g. by a manual sync) between detection
      // and this click — processFile skips with 'up_to_date' and returns no id.
      // Resolve the existing document so we can still attach it.
      if (!documentId && result.skipped && result.reason === 'up_to_date') {
        const [existing] = await db
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.user_id, row.userId),
              eq(documents.wolke_share_link_id, row.shareLinkId),
              eq(documents.wolke_file_path, row.filePath)
            )
          )
          .limit(1);
        documentId = existing ? String(existing.id) : null;
      }

      if (!documentId) {
        log.error(
          `[wolkePendingContract.addPendingFile] Import produced no document (reason=${result.reason ?? 'unknown'}) for ${row.filePath}`
        );
        return { status: 500 as const, body: { error: 'Import fehlgeschlagen' } };
      }

      await notebookHelper.addDocumentsToCollection(collectionId, [documentId], callingUserId);

      const [updated] = await db
        .update(wolkePendingFiles)
        .set({ status: 'added', resolvedAt: new Date() })
        .where(eq(wolkePendingFiles.id, row.id))
        .returning();

      return {
        status: 200 as const,
        body: { success: true, document_id: documentId, pending: toDto(updated) },
      };
    } catch (error) {
      log.error('[wolkePendingContract.addPendingFile] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  dismissPendingFile: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = args.params.id;

      const guard = await requireNotebookEdit(collectionId, userId);
      if (guard) return guard;

      const db = getDrizzleInstance();
      const [updated] = await db
        .update(wolkePendingFiles)
        .set({ status: 'dismissed', resolvedAt: new Date() })
        .where(
          and(
            eq(wolkePendingFiles.id, args.params.pendingId),
            eq(wolkePendingFiles.collectionId, collectionId)
          )
        )
        .returning();

      if (!updated) {
        return { status: 404 as const, body: { error: 'Datei nicht gefunden' } };
      }

      return { status: 200 as const, body: { success: true, pending: toDto(updated) } };
    } catch (error) {
      log.error('[wolkePendingContract.dismissPendingFile] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },

  setNotebookAutoSync: async (args) => {
    try {
      const userId = getUserId(args.req);
      const collectionId = args.params.id;

      const guard = await requireNotebookEdit(collectionId, userId);
      if (guard) return guard;

      const enabled = args.body.enabled;
      await notebookHelper.updateNotebookCollection(collectionId, { auto_sync: enabled });

      return { status: 200 as const, body: { success: true, auto_sync: enabled } };
    } catch (error) {
      log.error('[wolkePendingContract.setNotebookAutoSync] Error:', error);
      return { status: 500 as const, body: { error: 'Internal server error' } };
    }
  },
});

/**
 * Mount the ts-rest Wolke-pending contract router. requireAuth must be applied
 * at the path prefix in routes.ts before calling this.
 */
export function mountWolkePendingContractRouter(app: Application): void {
  createExpressEndpoints(wolkePendingContract, wolkePendingContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'wolkePendingContract'),
  });
}
