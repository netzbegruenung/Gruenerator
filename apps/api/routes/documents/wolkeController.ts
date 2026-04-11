/**
 * Wolke Controller - Wolke integration for document sync and import
 *
 * Handles:
 * - GET /sync-status - Get user's sync status
 * - POST /sync - Start folder sync
 * - POST /auto-sync - Set auto-sync for folder
 * - GET /browse/:shareLinkId - Browse files in Wolke share
 * - POST /import - Import selected files from Wolke
 */

import path from 'path';

import express, { type Router, type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import NextcloudApiClient from '../../services/api-clients/nextcloudApiClient.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { getWolkeSyncService } from '../../services/sync/index.js';
import { createLogger } from '../../utils/logger.js';

import type { NextcloudFile } from '../../services/sync/types.js';

import { formatFileSize } from './helpers.js';

import type { DocumentRequest, WolkeImportResult } from './types.js';

const log = createLogger('documents:wolke');
const router: Router = express.Router();

// Initialize services
const wolkeSyncService = getWolkeSyncService();
const postgresDocumentService = getPostgresDocumentService();

// Supported file types for Wolke import
const SUPPORTED_FILE_TYPES = ['.pdf', '.txt', '.md', '.doc', '.docx'];

const wolkeSyncSchema = z.object({
  shareLinkId: z.string().min(1),
  folderPath: z.string().optional(),
});

const wolkeAutoSyncSchema = z.object({
  shareLinkId: z.string().min(1),
  folderPath: z.string().optional(),
  enabled: z.boolean(),
});

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
 * GET /sync-status - Get user's sync status
 */
router.get('/sync-status', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const syncStatuses = await wolkeSyncService.getUserSyncStatus(userId);

    res.json({
      success: true,
      syncStatuses,
    });
  } catch (error) {
    log.error('[GET /sync-status] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get sync status',
    });
  }
});

/**
 * POST /sync - Start folder sync (background operation)
 */
router.post(
  '/sync',
  validateBody(wolkeSyncSchema),
  async (req: TypedRequest<z.infer<typeof wolkeSyncSchema>>, res: Response): Promise<void> => {
    try {
      const { shareLinkId, folderPath = '' } = req.body;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Start sync in background (fire and forget)
      wolkeSyncService
        .syncFolder(userId, shareLinkId, folderPath)
        .then((result) => {
          log.debug(`[POST /sync] Sync completed:`, result);
        })
        .catch((error) => {
          log.error(`[POST /sync] Sync failed:`, error);
        });

      res.json({
        success: true,
        message: 'Folder sync started',
        shareLinkId,
        folderPath,
      });
    } catch (error) {
      log.error('[POST /sync] Error:', error);
      res.status(500).json({
        success: false,
        message: (error as Error).message || 'Failed to start folder sync',
      });
    }
  }
);

/**
 * POST /auto-sync - Set auto-sync for a folder
 */
router.post(
  '/auto-sync',
  validateBody(wolkeAutoSyncSchema),
  async (req: TypedRequest<z.infer<typeof wolkeAutoSyncSchema>>, res: Response): Promise<void> => {
    try {
      const { shareLinkId, folderPath = '', enabled } = req.body;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await wolkeSyncService.setAutoSync(userId, shareLinkId, folderPath, enabled);

      res.json({
        ...result,
        success: true,
      });
    } catch (error) {
      log.error('[POST /auto-sync] Error:', error);
      res.status(500).json({
        success: false,
        message: (error as Error).message || 'Failed to set auto-sync',
      });
    }
  }
);

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

      const folderPath = (req.query.path as string) || '';
      log.debug(`[GET /browse/:shareLinkId] Browsing files for share link ${shareLinkId}`, {
        folderPath,
      });

      // Get the share link
      const shareLink = (await wolkeSyncService.getShareLink(userId, shareLinkId)) as {
        id?: string;
        label?: string;
        base_url?: string;
        share_link?: string;
      } | null;

      if (!shareLink) {
        res.status(404).json({ success: false, message: 'Share link not found' });
        return;
      }

      // List all files and folders (unfiltered, unlike listFolderContents which is for sync)
      const client = await NextcloudApiClient.create(shareLink.share_link ?? '');
      const files = await client.listFolder(folderPath || undefined);

      // Filter and enrich files with additional metadata for UI
      const enrichedFiles = files.map((file) => {
        const fileExtension = path.extname(file.name).toLowerCase();
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
          isSupported: SUPPORTED_FILE_TYPES.includes(fileExtension),
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
      });
    } catch (error) {
      log.error('[GET /browse/:shareLinkId] Error:', error);
      res.status(500).json({
        success: false,
        message: (error as Error).message || 'Failed to browse Wolke files',
      });
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

      // Get the share link
      const shareLink = (await wolkeSyncService.getShareLink(userId, shareLinkId)) as {
        id: string;
        url: string;
        token?: string;
        share_link?: string;
      };

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
          results.push({
            filename: fileInfo.name,
            success: false,
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
