import express from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { NextcloudShareManager } from '../../utils/nextcloudShareManager.js';
import NextcloudApiClient from '../../services/nextcloudApiClient.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

/**
 * Get Nextcloud integration status
 * GET /api/nextcloud/status
 */
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('[NextcloudApi] Getting Nextcloud status', { userId });
        
        const shareLinks = await NextcloudShareManager.getShareLinks(userId);
        const stats = await NextcloudShareManager.getUsageStats(userId);
        
        res.json({
            connected: shareLinks.length > 0,
            shareLinks: shareLinks,
            stats: stats
        });
        
    } catch (error) {
        console.error('[NextcloudApi] Error getting Nextcloud status', { error: error.message });
        res.status(500).json({
            error: 'Failed to get Nextcloud status',
            message: error.message
        });
    }
});

/**
 * Get user's Nextcloud share links
 * GET /api/nextcloud/share-links
 */
router.get('/share-links', async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('[NextcloudApi] Getting share links', { userId });
        
        const shareLinks = await NextcloudShareManager.getShareLinks(userId);
        
        res.json(shareLinks);
        
    } catch (error) {
        console.error('[NextcloudApi] Error getting share links', { error: error.message });
        res.status(500).json({
            error: 'Failed to get share links',
            message: error.message
        });
    }
});

/**
 * Save a new Nextcloud share link
 * POST /api/nextcloud/share-links
 */
router.post('/share-links', async (req, res) => {
    try {
        const userId = req.user.id;
        const { shareLink, label, baseUrl, shareToken } = req.body;
        
        console.log('[NextcloudApi] Saving new share link', { userId, label });
        
        // Validate required fields
        if (!shareLink) {
            return res.status(400).json({
                error: 'Share link is required'
            });
        }
        
        // Validate share link format
        const validation = NextcloudShareManager.validateShareLink(shareLink);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid share link',
                message: validation.error
            });
        }
        
        // Use validated values if not provided
        const finalBaseUrl = baseUrl || validation.baseUrl;
        const finalShareToken = shareToken || validation.shareToken;
        
        // Save the share link
        const savedLink = await NextcloudShareManager.saveShareLink(
            userId,
            shareLink,
            label,
            finalBaseUrl,
            finalShareToken
        );
        
        // Test the connection
        let connectionTest = null;
        try {
            const client = new NextcloudApiClient(shareLink);
            connectionTest = await client.testConnection();
        } catch (error) {
            console.warn('[NextcloudApi] Connection test failed for new share link', { 
                error: error.message,
                shareLinkId: savedLink.id 
            });
            connectionTest = {
                success: false,
                message: error.message
            };
        }
        
        res.status(201).json({
            ...savedLink,
            connectionTest
        });
        
    } catch (error) {
        console.error('[NextcloudApi] Error saving share link', { error: error.message });
        
        if (error.message.includes('already saved')) {
            return res.status(409).json({
                error: 'Share link already exists',
                message: error.message
            });
        }
        
        res.status(500).json({
            error: 'Failed to save share link',
            message: error.message
        });
    }
});

/**
 * Delete a Nextcloud share link
 * DELETE /api/nextcloud/share-links/:id
 */
router.delete('/share-links/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const shareLinkId = req.params.id;
        
        console.log('[NextcloudApi] Deleting share link', { userId, shareLinkId });
        
        if (!shareLinkId) {
            return res.status(400).json({
                error: 'Share link ID is required'
            });
        }
        
        const result = await NextcloudShareManager.deleteShareLink(userId, shareLinkId);
        
        res.json(result);
        
    } catch (error) {
        console.error('[NextcloudApi] Error deleting share link', { error: error.message });
        
        if (error.message.includes('not found') || error.message.includes('no permission')) {
            return res.status(404).json({
                error: 'Share link not found',
                message: error.message
            });
        }
        
        res.status(500).json({
            error: 'Failed to delete share link',
            message: error.message
        });
    }
});

/**
 * Test connection to a Nextcloud share
 * POST /api/nextcloud/test-connection
 */
router.post('/test-connection', async (req, res) => {
    try {
        const userId = req.user.id;
        const { shareLink } = req.body;
        
        console.log('[NextcloudApi] Testing Nextcloud connection', { userId });
        
        if (!shareLink) {
            return res.status(400).json({
                error: 'Share link is required'
            });
        }
        
        // Validate share link format
        const validation = NextcloudShareManager.validateShareLink(shareLink);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid share link',
                message: validation.error
            });
        }
        
        // Test connection
        const client = new NextcloudApiClient(shareLink);
        const testResult = await client.testConnection();
        
        res.json(testResult);
        
    } catch (error) {
        console.error('[NextcloudApi] Error testing connection', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Upload file to a Nextcloud share
 * POST /api/nextcloud/upload
 */
router.post('/upload', async (req, res) => {
    try {
        const userId = req.user.id;
        const { shareLinkId, content, filename } = req.body;
        
        console.log('[NextcloudApi] Uploading file to Nextcloud', { userId, filename, shareLinkId });
        
        // Validate required fields
        if (!shareLinkId) {
            return res.status(400).json({
                error: 'Share link ID is required'
            });
        }
        
        if (!content) {
            return res.status(400).json({
                error: 'File content is required'
            });
        }
        
        if (!filename) {
            return res.status(400).json({
                error: 'Filename is required'
            });
        }
        
        // Get the share link from database
        const shareLink = await NextcloudShareManager.getShareLinkById(userId, shareLinkId);
        
        if (!shareLink || !shareLink.is_active) {
            return res.status(404).json({
                error: 'Share link not found or inactive'
            });
        }
        
        // Upload the file
        const client = new NextcloudApiClient(shareLink.share_link);
        const uploadResult = await client.uploadFile(content, filename);
        
        res.json(uploadResult);
        
    } catch (error) {
        console.error('[NextcloudApi] Error uploading file', { error: error.message });
        
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }
        
        if (error.message.includes('Authentication failed') || error.message.includes('forbidden')) {
            return res.status(403).json({
                success: false,
                message: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get share information (list files)
 * GET /api/nextcloud/share-links/:id/info
 */
router.get('/share-links/:id/info', async (req, res) => {
    try {
        const userId = req.user.id;
        const shareLinkId = req.params.id;
        
        console.log('[NextcloudApi] Getting share info', { userId, shareLinkId });
        
        if (!shareLinkId) {
            return res.status(400).json({
                error: 'Share link ID is required'
            });
        }
        
        // Get the share link from database
        const shareLink = await NextcloudShareManager.getShareLinkById(userId, shareLinkId);
        
        if (!shareLink || !shareLink.is_active) {
            return res.status(404).json({
                error: 'Share link not found or inactive'
            });
        }
        
        // Get share information
        const client = new NextcloudApiClient(shareLink.share_link);
        const shareInfo = await client.getShareInfo();
        
        res.json(shareInfo);
        
    } catch (error) {
        console.error('[NextcloudApi] Error getting share info', { error: error.message });
        res.status(500).json({
            error: 'Failed to get share information',
            message: error.message
        });
    }
});

/**
 * Update share link
 * PUT /api/nextcloud/share-links/:id
 */
router.put('/share-links/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const shareLinkId = req.params.id;
        const { label, is_active } = req.body;
        
        console.log('[NextcloudApi] Updating share link', { userId, shareLinkId });
        
        if (!shareLinkId) {
            return res.status(400).json({
                error: 'Share link ID is required'
            });
        }
        
        // Prepare updates object
        const updates = {};
        if (typeof label === 'string') {
            updates.label = label.trim() || null;
        }
        if (typeof is_active === 'boolean') {
            updates.is_active = is_active;
        }
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                error: 'No valid updates provided'
            });
        }
        
        const updatedLink = await NextcloudShareManager.updateShareLink(userId, shareLinkId, updates);
        
        res.json(updatedLink);
        
    } catch (error) {
        console.error('[NextcloudApi] Error updating share link', { error: error.message });
        
        if (error.message.includes('not found') || error.message.includes('no permission')) {
            return res.status(404).json({
                error: 'Share link not found',
                message: error.message
            });
        }
        
        res.status(500).json({
            error: 'Failed to update share link',
            message: error.message
        });
    }
});

export default router;