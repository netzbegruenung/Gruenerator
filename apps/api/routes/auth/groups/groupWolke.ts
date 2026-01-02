/**
 * Group Wolke (Nextcloud) integration routes
 * Handles Nextcloud share links, sync, and upload functionality for groups
 */

import express, { Router, Response } from 'express';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { createLogger } from '../../../utils/logger.js';
import { getPostgresAndCheckMembership } from './groupCore.js';
import type { AuthRequest } from '../types.js';

const log = createLogger('groupWolke');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Wolke Share Links Management
// ============================================================================

/**
 * Get group's Wolke share links
 * GET /:groupId/wolke/share-links
 */
router.get('/:groupId/wolke/share-links', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user!.id;

    // Check if user is member of the group
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Get group's Wolke share links
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    if (!group) {
      res.status(404).json({
        success: false,
        message: 'Gruppe nicht gefunden.'
      });
      return;
    }

    const shareLinks = group.wolke_share_links || [];

    res.json({
      success: true,
      shareLinks: shareLinks
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/share-links GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Abrufen der Wolke-Links.'
    });
  }
});

/**
 * Add new Wolke share link to group
 * POST /:groupId/wolke/share-links
 */
router.post('/:groupId/wolke/share-links', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user!.id;
    const { shareLink, label, baseUrl, shareToken } = req.body;

    // Check if user is admin of the group (only admins can add Wolke links)
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    if (!shareLink) {
      res.status(400).json({
        success: false,
        message: 'Share-Link ist erforderlich.'
      });
      return;
    }

    // Validate share link format
    const urlObj = new URL(shareLink);
    const sharePattern = /\/s\/[A-Za-z0-9]+/;
    if (!sharePattern.test(urlObj.pathname)) {
      res.status(400).json({
        success: false,
        message: 'Ungültiges Nextcloud Share-Link Format.'
      });
      return;
    }

    // Extract share token
    const tokenMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
    const finalShareToken = shareToken || (tokenMatch ? tokenMatch[1] : null);
    const finalBaseUrl = baseUrl || `${urlObj.protocol}//${urlObj.host}`;

    // Get current share links
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    const currentLinks = (group?.wolke_share_links || []) as any[];

    // Check if share link already exists
    const existingLink = currentLinks.find((link: any) => link.share_link === shareLink);
    if (existingLink) {
      res.status(409).json({
        success: false,
        message: 'Dieser Share-Link ist bereits in der Gruppe vorhanden.'
      });
      return;
    }

    // Create new link object
    const newLink = {
      id: Date.now().toString(), // Simple ID based on timestamp
      share_link: shareLink,
      label: label || null,
      base_url: finalBaseUrl,
      share_token: finalShareToken,
      is_active: true,
      added_by_user_id: userId,
      created_at: new Date().toISOString()
    };

    // Add to existing links
    const updatedLinks = [...currentLinks, newLink];

    // Update the group with new links
    const result = await postgres.update(
      'groups',
      { wolke_share_links: updatedLinks },
      { id: groupId }
    );

    if (!result || result.changes === 0) {
      throw new Error('Fehler beim Speichern des Share-Links');
    }

    res.status(201).json({
      success: true,
      shareLink: newLink,
      message: 'Wolke-Link erfolgreich zur Gruppe hinzugefügt.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/share-links POST] Error:', err);

    if (err.message.includes('Keine Berechtigung')) {
      res.status(403).json({
        success: false,
        message: err.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Hinzufügen des Wolke-Links.'
    });
  }
});

/**
 * Delete Wolke share link from group
 * DELETE /:groupId/wolke/share-links/:shareId
 */
router.delete('/:groupId/wolke/share-links/:shareId', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const shareId = req.params.shareId;
    const userId = req.user!.id;

    // Check if user is admin of the group (only admins can delete Wolke links)
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);

    if (!shareId) {
      res.status(400).json({
        success: false,
        message: 'Share-Link ID ist erforderlich.'
      });
      return;
    }

    // Get current share links
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    const currentLinks = (group?.wolke_share_links || []) as any[];
    const linkToDelete = currentLinks.find((link: any) => link.id === shareId);

    if (!linkToDelete) {
      res.status(404).json({
        success: false,
        message: 'Share-Link nicht gefunden.'
      });
      return;
    }

    // Remove the link from the array
    const updatedLinks = currentLinks.filter((link: any) => link.id !== shareId);

    // Update the group
    const result = await postgres.update(
      'groups',
      { wolke_share_links: updatedLinks },
      { id: groupId }
    );

    if (!result || result.changes === 0) {
      throw new Error('Fehler beim Löschen des Share-Links');
    }

    res.json({
      success: true,
      deletedId: shareId,
      message: 'Wolke-Link erfolgreich aus der Gruppe entfernt.'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/share-links/:shareId DELETE] Error:', err);

    if (err.message.includes('Keine Berechtigung')) {
      res.status(403).json({
        success: false,
        message: err.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Löschen des Wolke-Links.'
    });
  }
});

// ============================================================================
// Wolke Connection & Upload
// ============================================================================

/**
 * Test connection to a Wolke share
 * POST /:groupId/wolke/test-connection
 */
router.post('/:groupId/wolke/test-connection', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user!.id;
    const { shareLink } = req.body;

    // Check if user is member of the group
    await getPostgresAndCheckMembership(groupId, userId, false);

    if (!shareLink) {
      res.status(400).json({
        success: false,
        message: 'Share-Link ist erforderlich.'
      });
      return;
    }

    // Import NextcloudApiClient for testing
    const { default: NextcloudApiClient } = await import('../../../services/api-clients/nextcloudApiClient.js');

    // Test connection
    const client = new NextcloudApiClient(shareLink);
    const testResult = await client.testConnection();

    res.json(testResult);

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/test-connection POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Testen der Verbindung.'
    });
  }
});

/**
 * Upload test file to Wolke share
 * POST /:groupId/wolke/upload-test
 */
router.post('/:groupId/wolke/upload-test', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user!.id;
    const { shareLinkId, content, filename } = req.body;

    // Check if user is member of the group
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Validate required fields
    if (!shareLinkId || !content || !filename) {
      res.status(400).json({
        success: false,
        message: 'Share-Link ID, Content und Filename sind erforderlich.'
      });
      return;
    }

    // Get the group's share link
    const group = await postgres.queryOne(
      'SELECT wolke_share_links FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    const shareLinks = (group?.wolke_share_links || []) as any[];
    const shareLink = shareLinks.find((link: any) => link.id === shareLinkId && link.is_active);

    if (!shareLink) {
      res.status(404).json({
        success: false,
        message: 'Share-Link nicht gefunden oder inaktiv.'
      });
      return;
    }

    // Import NextcloudApiClient for upload
    const { default: NextcloudApiClient } = await import('../../../services/api-clients/nextcloudApiClient.js');

    // Upload the file
    const client = new NextcloudApiClient(shareLink.share_link);
    const uploadResult = await client.uploadFile(content, filename);

    res.json(uploadResult);

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/upload-test POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Test-Upload.'
    });
  }
});

// ============================================================================
// Wolke Sync
// ============================================================================

/**
 * Get group's Wolke sync status
 * GET /:groupId/wolke/sync-status
 */
router.get('/:groupId/wolke/sync-status', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user!.id;

    // Check if user is member of the group
    const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

    // Get sync statuses for this group
    const syncStatuses = await postgres.query(
      'SELECT * FROM wolke_sync_status WHERE context_type = $1 AND context_id = $2 ORDER BY last_sync_at DESC',
      ['group', groupId]
    );

    res.json({
      success: true,
      syncStatuses: syncStatuses || []
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/sync-status GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Abrufen der Sync-Status.'
    });
  }
});

/**
 * Start Wolke folder sync for group
 * POST /:groupId/wolke/sync
 */
router.post('/:groupId/wolke/sync', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user!.id;
    const { shareLinkId, folderPath = '' } = req.body;

    // Check if user is member of the group (all members can sync)
    await getPostgresAndCheckMembership(groupId, userId, false);

    if (!shareLinkId) {
      res.status(400).json({
        success: false,
        message: 'Share-Link ID ist erforderlich.'
      });
      return;
    }

    // Import WolkeSyncService for group sync
    const { getWolkeSyncService } = await import('../../../services/sync/WolkeSyncService.js');
    const wolkeSyncService = getWolkeSyncService() as any;

    // Start sync in background with group context
    // Note: Using groupId as the context identifier for group-level sync
    wolkeSyncService.syncFolder(groupId, shareLinkId, folderPath)
      .then(() => {
        log.debug(`[User Groups /groups/:groupId/wolke/sync POST] Sync completed for group ${groupId}`);
      })
      .catch((syncError: Error) => {
        log.error(`[User Groups /groups/:groupId/wolke/sync POST] Sync failed:`, syncError);
      });

    res.json({
      success: true,
      message: 'Synchronisation gestartet.',
      shareLinkId,
      folderPath
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/sync POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Starten der Synchronisation.'
    });
  }
});

/**
 * Set auto-sync for group Wolke folder
 * POST /:groupId/wolke/auto-sync
 */
router.post('/:groupId/wolke/auto-sync', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.groupId;
    const userId = req.user!.id;
    const { shareLinkId, folderPath = '', enabled } = req.body;

    // Check if user is admin of the group (only admins can set auto-sync)
    await getPostgresAndCheckMembership(groupId, userId, true);

    if (!shareLinkId || typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'Share-Link ID und enabled-Status sind erforderlich.'
      });
      return;
    }

    // Import WolkeSyncService for auto-sync
    const { getWolkeSyncService } = await import('../../../services/sync/WolkeSyncService.js');
    const wolkeSyncService = getWolkeSyncService() as any;

    // Set auto-sync with group context
    // Note: Using groupId as the context identifier for group-level sync
    await wolkeSyncService.setAutoSync(groupId, shareLinkId, folderPath, enabled);

    res.json({
      success: true,
      autoSyncEnabled: enabled,
      message: `Auto-Sync ${enabled ? 'aktiviert' : 'deaktiviert'}.`
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Groups /groups/:groupId/wolke/auto-sync POST] Error:', err);

    if (err.message.includes('Keine Berechtigung')) {
      res.status(403).json({
        success: false,
        message: err.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Setzen der Auto-Sync Einstellung.'
    });
  }
});

export default router;
