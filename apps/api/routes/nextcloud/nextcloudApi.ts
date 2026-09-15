import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import NextcloudApiClient, {
  type ConnectionTestResult,
} from '../../services/api-clients/nextcloudApiClient.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
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

const updateShareLinkSchema = z.object({
  label: z.string().nullish(),
  is_active: z.boolean().nullish(),
});

type SaveShareLinkBody = z.infer<typeof saveShareLinkSchema>;
type TestConnectionBody = z.infer<typeof testConnectionSchema>;
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
      message: toUserFacingMessage(err),
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
      message: toUserFacingMessage(err),
    });
  }
});

/**
 * List Wolke share links that other users shared into the caller's groups.
 * GET /api/nextcloud/share-links/shared-with-me
 *
 * Sibling route rather than a new field on GET /share-links so existing
 * consumers of that response keep their shape.
 */
router.get('/share-links/shared-with-me', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const sharedWithMe = await NextcloudShareManager.listLinksSharedWithUser(userId);

    res.json({
      success: true,
      sharedWithMe,
    });
  } catch (error) {
    const err = error as Error;
    log.error('[NextcloudApi] Error listing shared-with-me links', { error: err.message });
    res.status(500).json({
      error: 'Failed to list shared share links',
      message: toUserFacingMessage(err),
    });
  }
});

/**
 * List the groups that one of the caller's own share links is currently shared with.
 * GET /api/nextcloud/share-links/:id/groups
 */
router.get(
  '/share-links/:id/groups',
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const shareLinkId = req.params.id;
      if (!shareLinkId) {
        res.status(400).json({ error: 'Share link ID is required' });
        return;
      }

      // Confirms the link belongs to this user before exposing share metadata.
      try {
        await NextcloudShareManager.getShareLinkById(userId, shareLinkId);
      } catch {
        res.status(404).json({ error: 'Share link not found' });
        return;
      }

      const groups = await NextcloudShareManager.listGroupSharesForLink(userId, shareLinkId);

      res.json({
        success: true,
        groups,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error listing groups for share link', { error: err.message });
      res.status(500).json({
        error: 'Failed to list groups for share link',
        message: toUserFacingMessage(err),
      });
    }
  }
);

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

      // Der volle Typ, nicht `{success, message}`: die schmalere Annotation
      // strippte den `errorCode`, den das Frontend für die deutsche
      // Fehlerdeutung braucht — der Wert war längst da.
      let connectionTest: ConnectionTestResult | null = null;
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
          errorCode: 'invalid_link',
        };
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
          message: toUserFacingMessage(err),
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to save share link',
        message: toUserFacingMessage(err),
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
          message: toUserFacingMessage(err),
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to delete share link',
        message: toUserFacingMessage(err),
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

      // Wirft der Client-Bau (Format/SSRF), ist das ein unbrauchbarer LINK,
      // kein Serverfehler — ohne errorCode fiele der Wizard in den
      // nichtssagenden unknown-Zweig.
      let client: NextcloudApiClient;
      try {
        client = await NextcloudApiClient.create(shareLink);
      } catch (createError) {
        const createErr = createError as Error;
        log.warn('[NextcloudApi] Share link rejected before test', { error: createErr.message });
        res.json({
          success: false,
          message: toUserFacingMessage(createErr),
          errorCode: 'invalid_link',
        } satisfies ConnectionTestResult);
        return;
      }
      const testResult = await client.testConnection();

      res.json(testResult);
    } catch (error) {
      const err = error as Error;
      log.error('[NextcloudApi] Error testing connection', { error: err.message });
      res.status(500).json({
        success: false,
        message: toUserFacingMessage(err),
        errorCode: 'unknown',
      } satisfies ConnectionTestResult);
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
          message: toUserFacingMessage(err),
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to update share link',
        message: toUserFacingMessage(err),
      });
    }
  }
);

export default router;
