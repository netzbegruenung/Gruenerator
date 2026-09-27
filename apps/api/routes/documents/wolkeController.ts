/**
 * Wolke Controller - Wolke integration for document browse and import
 *
 * Handles:
 * - GET /browse/:shareLinkId - Browse files in Wolke share
 * - POST /import - Import selected files from Wolke
 */

import express, { type Router, type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import NextcloudApiClient from '../../services/api-clients/nextcloudApiClient.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { walkWolkeFolder } from '../../services/sync/folderWalk.js';
import { getWolkeSyncService } from '../../services/sync/index.js';
import {
  isSupportedWolkeFile,
  wolkeFileExtension,
} from '../../services/sync/supportedFileTypes.js';
import { createLogger } from '../../utils/logger.js';
import { CloudPathError } from '../../utils/validation/cloudPaths.js';

import { formatFileSize } from './helpers.js';

import type { DocumentRequest, WolkeImportResult } from './types.js';
// Two shapes share the name: the WebDAV listing entry (nullable size, knows
// about directories) and the narrower one processFile takes.
import type { NextcloudFile as NextcloudListEntry } from '../../services/api-clients/nextcloudApiClient.js';
import type { NextcloudFile } from '../../services/sync/types.js';

const log = createLogger('documents:wolke');
const router: Router = express.Router();

// Initialize services
const wolkeSyncService = getWolkeSyncService();
const postgresDocumentService = getPostgresDocumentService();

const wolkeFileInfoSchema = z.object({
  name: z.string(),
  href: z.string(),
  size: z.number().optional(),
  lastModified: z.unknown().optional(),
});

const wolkeImportSchema = z.object({
  shareLinkId: z.string().min(1),
  files: z.array(wolkeFileInfoSchema).min(1),
});

/**
 * GET /browse/:shareLinkId - Browse files in a Wolke share without syncing
 */
router.get(
  '/browse/:shareLinkId',
  async (req: DocumentRequest<{ shareLinkId: string }>, res: Response): Promise<void> => {
    try {
      const { shareLinkId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!shareLinkId) {
        res.status(400).json({
          success: false,
          message: 'Share link ID is required',
        });
        return;
      }

      // `?path=a&path=b` makes Express hand back an array. The cast that used to
      // stand here claimed otherwise, and every string method downstream threw.
      const folderPath = typeof req.query.path === 'string' ? req.query.path : '';
      // Opt-in: one PROPFIND per subfolder, and every file found becomes a
      // download + OCR + embedding run at import time.
      const recursive = req.query.recursive === 'true';
      log.debug(`[GET /browse/:shareLinkId] Browsing files for share link ${shareLinkId}`, {
        folderPath,
        recursive,
      });

      const shareLink = await wolkeSyncService.getShareLink(userId, shareLinkId);

      // Unfiltered on purpose: the UI decides what to show, the sync path filters.
      const client = await NextcloudApiClient.create(shareLink.share_link);
      const listFolder = (path: string) => client.listFolder(path || undefined);

      // Non-recursive keeps returning directory entries: the folder tree browser
      // uses this same endpoint to navigate and would lose its subfolders.
      // The recursive walk returns files only — its whole point is that the
      // caller no longer has to navigate.
      let files: NextcloudListEntry[];
      let folderCount: number;
      let depthLimited = false;
      let truncated = false;

      if (recursive) {
        const walk = await walkWolkeFolder(listFolder, folderPath);
        files = walk.files;
        folderCount = walk.folderCount;
        depthLimited = walk.depthLimited;
        truncated = walk.truncated;
      } else {
        files = await listFolder(folderPath);
        folderCount = files.filter((entry) => entry.isDirectory).length;
      }

      // Filter and enrich files with additional metadata for UI
      const enrichedFiles = files.map((file) => {
        const fileExtension = wolkeFileExtension(file.name);
        const lastModified = file.lastModified;
        const lastModifiedStr = lastModified
          ? (typeof lastModified === 'string'
              ? new Date(lastModified)
              : lastModified
            ).toLocaleDateString('de-DE')
          : 'Unknown';

        return {
          ...file,
          fileExtension,
          isSupported: !file.isDirectory && isSupportedWolkeFile(file.name),
          sizeFormatted: file.size ? formatFileSize(file.size) : 'Unknown',
          lastModifiedFormatted: lastModifiedStr,
        };
      });

      res.json({
        success: true,
        shareLink: {
          id: shareLink.id,
          label: shareLink.label,
          baseUrl: shareLink.base_url,
        },
        files: enrichedFiles,
        totalFiles: enrichedFiles.length,
        supportedFiles: enrichedFiles.filter((f) => f.isSupported).length,
        // Lets the caller say "6 subfolders were not pulled" instead of leaving
        // them invisible, and name the limits when a recursive walk hit one.
        folderCount,
        recursive,
        depthLimited,
        truncated,
      });
    } catch (error) {
      log.error('[GET /browse/:shareLinkId] Error:', error);
      const message = (error as Error).message || 'Failed to browse Wolke files';
      // Ein `?path=` mit `..` ist eine schlechte Anfrage, kein Serverfehler —
      // und ausdrücklich kein still zurechtgebogener Ordner (#3043).
      const status =
        error instanceof CloudPathError ? 400 : message === 'Share link not found' ? 404 : 500;
      res.status(status).json({ success: false, message });
    }
  }
);

/**
 * POST /import - Import selected files from Wolke
 */
router.post(
  '/import',
  validateBody(wolkeImportSchema),
  async (req: TypedRequest<z.infer<typeof wolkeImportSchema>>, res: Response): Promise<void> => {
    try {
      const { shareLinkId, files } = req.body;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      log.debug(`[POST /import] Importing ${files.length} files from share link ${shareLinkId}`);

      const shareLink = await wolkeSyncService.getShareLink(userId, shareLinkId);

      const results: WolkeImportResult[] = [];
      let successCount = 0;
      let failedCount = 0;

      // Process each selected file
      for (const fileInfo of files) {
        try {
          log.debug(`[POST /import] Processing file: ${fileInfo.name}`);

          // Check if file already exists to prevent duplicates
          const existingDoc = await postgresDocumentService.getDocumentByWolkeFile(
            userId,
            shareLinkId,
            fileInfo.href
          );

          if (existingDoc) {
            log.debug(`[POST /import] File already imported: ${fileInfo.name}`);
            results.push({
              filename: fileInfo.name,
              success: false,
              skipped: true,
              reason: 'already_imported',
              documentId: existingDoc.id,
            });
            continue;
          }

          // Use the wolke sync service to process the file
          const result = await wolkeSyncService.processFile(
            userId,
            shareLinkId,
            fileInfo as NextcloudFile,
            shareLink
          );

          if (result.success) {
            successCount++;
            results.push({
              filename: fileInfo.name,
              success: true,
              documentId: result.documentId,
              vectorsCreated: result.vectorsCreated,
            });
          } else if (result.skipped) {
            results.push({
              filename: fileInfo.name,
              success: false,
              skipped: true,
              reason: result.reason,
            });
          }
        } catch (error) {
          failedCount++;
          log.error(`[POST /import] Failed to process file ${fileInfo.name}:`, error);
          // `reason` is what the UI renders — the raw message is for the log and
          // for support, not for a label the user has to interpret.
          results.push({
            filename: fileInfo.name,
            success: false,
            reason: 'processing_failed',
            error: (error as Error).message,
          });
        }
      }

      log.debug(
        `[POST /import] Import completed: ${successCount} successful, ${failedCount} failed`
      );

      res.json({
        success: true,
        message: `Import completed: ${successCount} of ${files.length} files imported successfully`,
        results,
        summary: {
          total: files.length,
          successful: successCount,
          failed: failedCount,
          skipped: results.filter((r) => r.skipped).length,
        },
      });
    } catch (error) {
      log.error('[POST /import] Error:', error);
      res.status(500).json({
        success: false,
        message: (error as Error).message || 'Failed to import Wolke files',
      });
    }
  }
);

export default router;
