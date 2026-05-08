import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import NextcloudApiClient from '../../services/api-clients/nextcloudApiClient.js';
import { NextcloudShareManager } from '../../utils/integrations/nextcloud/index.js';
import { createLogger } from '../../utils/logger.js';

import type { ShareLinkUpdates } from '../../utils/integrations/nextcloud/types.js';

const log = createLogger('nextcloud');

const saveShareLinkSchema = z.object({
  shareLink: z.string().url(),
  label: z.string().nullish(),
  baseUrl: z.string().nullish(),
  shareToken: z.string().nullish(),
});

const testConnectionSchema = z.object({
  shareLink: z.string().url(),
});

const uploadSchema = z.object({
  shareLinkId: z.string(),
  content: z.string(),
  filename: z.string(),
  folderPath: z.string().nullish(),
  documentId: z.string().uuid().optional(),
  enableLiveSync: z.boolean().optional(),
});

const updateShareLinkSchema = z.object({
  label: z.string().nullish(),
  is_active: z.boolean().nullish(),
});

type SaveShareLinkBody = z.infer<typeof saveShareLinkSchema>;
type TestConnectionBody = z.infer<typeof testConnectionSchema>;
type UploadBody = z.infer<typeof uploadSchema>;
type UpdateShareLinkBody = z.infer<typeof updateShareLinkSchema>;

const router: Router = Router();

router.use(requireAuth);

/**
 * Get Nextcloud integration status
 * GET /api/nextcloud/status
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    log.debug('[NextcloudApi] Getting Nextcloud status', { userId });

    const shareLinks = await NextcloudShareManager.getShareLinks(userId);
    const stats = await NextcloudShareManager.getUsageStats(userId);

    res.json({
      connected: shareLinks.length > 0,
      shareLinks,
      stats,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[NextcloudApi] Error getting Nextcloud status', { error: err.message });
    res.status(500).json({
      error: 'Failed to get Nextcloud status',
      message: err.message,
    });
  }
});

/**
 * Get user's Nextcloud share links
 * GET /api/nextcloud/share-links
 */
router.get('/share-links', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    log.debug('[NextcloudApi] Getting share links', { userId });

    const shareLinks = await NextcloudShareManager.getShareLinks(userId);

    res.json({
      success: true,
      shareLinks,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[NextcloudApi] Error getting share links', { error: err.message });
    res.status(500).json({
      error: 'Failed to get share links',
      message: err.message,
    });
  }
});

/**
 * Save a new Nextcloud share link
 * POST /api/nextcloud/share-links
 */
router.post(
  '/share-links',
  validateBody(saveShareLinkSchema),
  async (req: TypedRequest<SaveShareLinkBody>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { shareLink, label, baseUrl, shareToken } = req.body;

      log.debug('[NextcloudApi] Saving new share link', { userId, label });

      if (!shareLink) {
        res.status(400).json({ error: 'Share link is required' });
        return;
      }

      const validation = NextcloudShareManager.validateShareLink(shareLink);
      if (!validation.isValid) {
        res.status(400).json({
          error: 'Invalid share link',
          message: validation.error,
        });
        return;
      }

      const finalBaseUrl = baseUrl || validation.baseUrl;
      const finalShareToken = shareToken || validation.shareToken;

      const savedLink = await NextcloudShareManager.saveShareLink(
        userId,
        shareLink,
        label || '',
        finalBaseUrl || '',
        finalShareToken || ''
      );

      let connectionTest: { success: boolean; message: string } | null = null;
      try {
        const client = await NextcloudApiClient.create(shareLink);
        connectionTest = await client.testConnection();
      } catch (testError) {
        const testErr = testError as Error;
        log.warn('[NextcloudApi] Connection test failed for new share link', {
          error: testErr.message,
          shareLinkId: savedLink.id,
        });
        connectionTest = {
          success: false,
          message: testErr.message,
        };
      }

      // Send Wolki unlock notification on first share link
      try {
        const allLinks = await NextcloudShareManager.getShareLinks(userId);
        if (allLinks.length === 1) {
          const { createNotification } = await import('../../services/notifications/index.js');
          await createNotification({
            userId,
            type: 'wolke_setup',
            title: 'Wolki freigeschaltet!',
            body: 'Deine Wolke ist verbunden — du hast einen neuen Avatar freigeschaltet!',
            actionUrl: '/profile',
            metadata: { avatarId: 10 },
          });
        }
      } catch (notifErr) {
        log.warn('[NextcloudApi] Failed to send Wolki notification', {
          error: (notifErr as Error).message,
        });
      }

      res.status(201).json({
        success: true,
        shareLink: savedLink,
        connectionTest,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error saving share link', { error: err.message });

      if (err.message.includes('already saved')) {
        res.status(409).json({
          error: 'Share link already exists',
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to save share link',
        message: err.message,
      });
    }
  }
);

/**
 * Delete a Nextcloud share link
 * DELETE /api/nextcloud/share-links/:id
 */
router.delete(
  '/share-links/:id',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const shareLinkId = req.params.id;

      log.debug('[NextcloudApi] Deleting share link', { userId, shareLinkId });

      if (!shareLinkId) {
        res.status(400).json({ error: 'Share link ID is required' });
        return;
      }

      const result = await NextcloudShareManager.deleteShareLink(userId, shareLinkId);

      res.json(result);
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error deleting share link', { error: err.message });

      if (err.message.includes('not found') || err.message.includes('no permission')) {
        res.status(404).json({
          error: 'Share link not found',
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to delete share link',
        message: err.message,
      });
    }
  }
);

/**
 * Test connection to a Nextcloud share
 * POST /api/nextcloud/test-connection
 */
router.post(
  '/test-connection',
  validateBody(testConnectionSchema),
  async (req: TypedRequest<TestConnectionBody>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { shareLink } = req.body;

      log.debug('[NextcloudApi] Testing Nextcloud connection', { userId });

      if (!shareLink) {
        res.status(400).json({ error: 'Share link is required' });
        return;
      }

      const validation = NextcloudShareManager.validateShareLink(shareLink);
      if (!validation.isValid) {
        res.status(400).json({
          error: 'Invalid share link',
          message: validation.error,
        });
        return;
      }

      const client = await NextcloudApiClient.create(shareLink);
      const testResult = await client.testConnection();

      res.json(testResult);
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error testing connection', { error: err.message });
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

/**
 * Browse folders in a Nextcloud share
 * GET /api/nextcloud/share-links/:id/browse?path=
 */
router.get(
  '/share-links/:id/browse',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const shareLinkId = req.params.id;
      const folderPath = (req.query.path as string) || '';

      log.debug('[NextcloudApi] Browsing folder', { userId, shareLinkId, folderPath });

      if (!shareLinkId) {
        res.status(400).json({ error: 'Share link ID is required' });
        return;
      }

      const shareLink = await NextcloudShareManager.getShareLinkById(userId, shareLinkId);

      if (!shareLink || !shareLink.is_active) {
        res.status(404).json({ error: 'Share link not found or inactive' });
        return;
      }

      const client = await NextcloudApiClient.create(shareLink.share_link);
      const items = await client.listFolder(folderPath || undefined);

      res.json({
        success: true,
        path: folderPath,
        items,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error browsing folder', { error: err.message });
      res.status(500).json({
        error: 'Failed to browse folder',
        message: err.message,
      });
    }
  }
);

/**
 * Upload file to a Nextcloud share
 * POST /api/nextcloud/upload
 */
router.post(
  '/upload',
  validateBody(uploadSchema),
  async (req: TypedRequest<UploadBody>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { shareLinkId, content, filename, folderPath, documentId, enableLiveSync } = req.body;

      log.debug('[NextcloudApi] Uploading file to Nextcloud', {
        userId,
        filename,
        shareLinkId,
        folderPath,
        documentId,
        enableLiveSync,
      });

      if (!shareLinkId) {
        res.status(400).json({ error: 'Share link ID is required' });
        return;
      }

      if (!content) {
        res.status(400).json({ error: 'File content is required' });
        return;
      }

      if (!filename) {
        res.status(400).json({ error: 'Filename is required' });
        return;
      }

      const shareLink = await NextcloudShareManager.getShareLinkById(userId, shareLinkId);

      if (!shareLink || !shareLink.is_active) {
        res.status(404).json({ error: 'Share link not found or inactive' });
        return;
      }

      const client = await NextcloudApiClient.create(shareLink.share_link);
      const uploadResult = await client.uploadFile(content, filename, folderPath ?? undefined);

      if (uploadResult.success && documentId) {
        try {
          const wolkeFilePath = folderPath ? `${folderPath}/${filename}` : filename;
          const db = getPostgresInstance();
          const updates: string[] = [
            'wolke_share_link_id = $1',
            'wolke_file_path = $2',
            'last_synced_at = NOW()',
          ];
          const values: unknown[] = [shareLinkId, wolkeFilePath];
          let paramIndex = 3;

          if (uploadResult.etag) {
            updates.push(`wolke_etag = $${paramIndex++}`);
            values.push(uploadResult.etag);
          }
          if (enableLiveSync !== undefined) {
            updates.push(`wolke_live_sync = $${paramIndex++}`);
            values.push(enableLiveSync);
          }

          values.push(documentId);
          values.push(userId);

          const idParam = paramIndex++;
          const userParam = paramIndex;

          await db.query(
            `UPDATE collaborative_documents
             SET ${updates.join(', ')}
             WHERE id = $${idParam}
               AND created_by = $${userParam}
               AND is_deleted = false`,
            values
          );
        } catch (linkErr) {
          const linkError = linkErr as Error;
          log.warn('[NextcloudApi] Upload succeeded but document link write failed', {
            documentId,
            error: linkError.message,
          });
        }
      }

      res.json(uploadResult);
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error uploading file', { error: err.message });

      if (err.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: err.message,
        });
        return;
      }

      if (err.message.includes('Authentication failed') || err.message.includes('forbidden')) {
        res.status(403).json({
          success: false,
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

/**
 * Upload test file to a Nextcloud share
 * POST /api/nextcloud/upload-test
 */
router.post(
  '/upload-test',
  validateBody(uploadSchema),
  async (req: TypedRequest<UploadBody>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { shareLinkId, content, filename } = req.body;

      log.debug('[NextcloudApi] Uploading test file to Nextcloud', {
        userId,
        filename,
        shareLinkId,
      });

      if (!shareLinkId) {
        res.status(400).json({
          success: false,
          message: 'Share link ID is required',
        });
        return;
      }

      if (!content) {
        res.status(400).json({
          success: false,
          message: 'File content is required',
        });
        return;
      }

      if (!filename) {
        res.status(400).json({
          success: false,
          message: 'Filename is required',
        });
        return;
      }

      const shareLink = await NextcloudShareManager.getShareLinkById(userId, shareLinkId);

      if (!shareLink || !shareLink.is_active) {
        res.status(404).json({
          success: false,
          message: 'Share link not found or inactive',
        });
        return;
      }

      const client = await NextcloudApiClient.create(shareLink.share_link);
      const uploadResult = await client.uploadFile(content, filename);

      res.json(uploadResult);
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error uploading test file', { error: err.message });

      if (err.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: err.message,
        });
        return;
      }

      if (err.message.includes('Authentication failed') || err.message.includes('forbidden')) {
        res.status(403).json({
          success: false,
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

/**
 * Get share information (list files)
 * GET /api/nextcloud/share-links/:id/info
 */
router.get(
  '/share-links/:id/info',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const shareLinkId = req.params.id;

      log.debug('[NextcloudApi] Getting share info', { userId, shareLinkId });

      if (!shareLinkId) {
        res.status(400).json({ error: 'Share link ID is required' });
        return;
      }

      const shareLink = await NextcloudShareManager.getShareLinkById(userId, shareLinkId);

      if (!shareLink || !shareLink.is_active) {
        res.status(404).json({ error: 'Share link not found or inactive' });
        return;
      }

      const client = await NextcloudApiClient.create(shareLink.share_link);
      const shareInfo = await client.getShareInfo();

      res.json(shareInfo);
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error getting share info', { error: err.message });
      res.status(500).json({
        error: 'Failed to get share information',
        message: err.message,
      });
    }
  }
);

/**
 * Update share link
 * PUT /api/nextcloud/share-links/:id
 */
router.put(
  '/share-links/:id',
  validateBody(updateShareLinkSchema),
  async (req: TypedRequest<UpdateShareLinkBody, { id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const shareLinkId = req.params.id;
      const { label, is_active } = req.body;

      log.debug('[NextcloudApi] Updating share link', { userId, shareLinkId });

      if (!shareLinkId) {
        res.status(400).json({ error: 'Share link ID is required' });
        return;
      }

      const updates: ShareLinkUpdates = {};
      if (typeof label === 'string') {
        updates.label = label.trim() || null;
      }
      if (typeof is_active === 'boolean') {
        updates.is_active = is_active;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No valid updates provided' });
        return;
      }

      const updatedLink = await NextcloudShareManager.updateShareLink(userId, shareLinkId, updates);

      res.json(updatedLink);
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error updating share link', { error: err.message });

      if (err.message.includes('not found') || err.message.includes('no permission')) {
        res.status(404).json({
          error: 'Share link not found',
          message: err.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to update share link',
        message: err.message,
      });
    }
  }
);

/**
 * Debug route to check database state
 * GET /api/nextcloud/debug/database-state
 */
router.get('/debug/database-state', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    log.debug('[NextcloudApi] Debug: Checking database state', { userId });

    const dbState = await NextcloudShareManager.checkDatabaseState(userId);

    res.json({
      success: true,
      debug: true,
      ...dbState,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[NextcloudApi] Error checking database state', { error: err.message });
    res.status(500).json({
      error: 'Failed to check database state',
      message: err.message,
    });
  }
});

export default router;
