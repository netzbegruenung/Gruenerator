const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { requireAuth } = require('../../middleware/authMiddleware');
const { createLogger } = require('../../utils/logger.js');
const redisClient = require('../../utils/redisClient');

const log = createLogger('subtitler-share');

let shareService = null;
let projectService = null;

async function getShareService() {
    if (!shareService) {
        const { getSubtitlerShareService } = await import('./services/shareService.js');
        shareService = getSubtitlerShareService();
        await shareService.ensureInitialized();
    }
    return shareService;
}

async function getProjectService() {
    if (!projectService) {
        const { getSubtitlerProjectService } = await import('../../services/subtitlerProjectService.js');
        projectService = getSubtitlerProjectService();
        await projectService.ensureInitialized();
    }
    return projectService;
}


// POST /api/subtitler/share - Create a share from an export token (auth required)
router.post('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { exportToken, title, projectId, expiresInDays = 7 } = req.body;

        if (!exportToken) {
            return res.status(400).json({
                success: false,
                error: 'Export-Token wird benötigt'
            });
        }

        // Get export data from Redis
        const exportDataString = await redisClient.get(`export:${exportToken}`);
        if (!exportDataString) {
            return res.status(404).json({
                success: false,
                error: 'Export nicht gefunden oder abgelaufen'
            });
        }

        const exportData = JSON.parse(exportDataString);
        if (exportData.status !== 'complete') {
            return res.status(400).json({
                success: false,
                error: 'Export noch nicht abgeschlossen'
            });
        }

        const { outputPath, duration } = exportData;

        // Check if file exists
        try {
            await fsPromises.access(outputPath);
        } catch {
            return res.status(404).json({
                success: false,
                error: 'Export-Datei nicht gefunden'
            });
        }

        const service = await getShareService();
        const share = await service.createShare(userId, {
            videoPath: outputPath,
            title: title || 'Untertiteltes Video',
            thumbnailPath: null,
            duration: duration || null,
            projectId: projectId || null,
            expiresInDays
        });

        log.info(`Share created: ${share.shareToken} by user ${userId}`);

        res.json({
            success: true,
            share: {
                shareToken: share.shareToken,
                shareUrl: share.shareUrl,
                expiresAt: share.expiresAt
            }
        });

    } catch (error) {
        log.error('Failed to create share:', error);
        res.status(500).json({
            success: false,
            error: 'Share konnte nicht erstellt werden'
        });
    }
});

// POST /api/subtitler/share/from-project - Create a share from a saved project (auth required)
router.post('/from-project', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { projectId, title, expiresInDays = 7 } = req.body;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: 'Projekt-ID wird benötigt'
            });
        }

        // Get project service and verify ownership
        const projService = await getProjectService();
        let project;
        try {
            project = await projService.getProject(userId, projectId);
        } catch (err) {
            return res.status(404).json({
                success: false,
                error: 'Projekt nicht gefunden oder keine Berechtigung'
            });
        }

        if (!project || !project.video_path) {
            return res.status(404).json({
                success: false,
                error: 'Projekt-Video nicht gefunden'
            });
        }

        // Check if subtitled video exists - require export before sharing
        if (!project.subtitled_video_path) {
            return res.status(400).json({
                success: false,
                error: 'Bitte exportiere das Video zuerst, bevor du es teilen kannst.',
                code: 'EXPORT_REQUIRED'
            });
        }

        // Get the subtitled video path
        const videoPath = projService.getSubtitledVideoPath(project.subtitled_video_path);

        // Check if subtitled video file exists
        try {
            await fsPromises.access(videoPath);
        } catch {
            return res.status(400).json({
                success: false,
                error: 'Bitte exportiere das Video erneut, bevor du es teilen kannst.',
                code: 'EXPORT_REQUIRED'
            });
        }

        // Get thumbnail path if exists
        let thumbnailPath = null;
        if (project.thumbnail_path) {
            thumbnailPath = projService.getThumbnailPath(project.thumbnail_path);
            try {
                await fsPromises.access(thumbnailPath);
            } catch {
                thumbnailPath = null;
            }
        }

        // Create the share
        const service = await getShareService();
        const share = await service.createShare(userId, {
            videoPath: videoPath,
            title: title || project.title || 'Untertiteltes Video',
            thumbnailPath: thumbnailPath,
            duration: project.video_metadata?.duration || null,
            projectId: projectId,
            expiresInDays
        });

        log.info(`Share created from project: ${share.shareToken} for project ${projectId} by user ${userId}`);

        res.json({
            success: true,
            share: {
                shareToken: share.shareToken,
                shareUrl: share.shareUrl,
                expiresAt: share.expiresAt
            }
        });

    } catch (error) {
        log.error('Failed to create share from project:', error);
        res.status(500).json({
            success: false,
            error: 'Share konnte nicht erstellt werden'
        });
    }
});

// GET /api/subtitler/share/my - List user's shares (auth required)
router.get('/my', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const service = await getShareService();
        const shares = await service.getUserShares(userId);

        res.json({
            success: true,
            shares
        });

    } catch (error) {
        log.error('Failed to get user shares:', error);
        res.status(500).json({
            success: false,
            error: 'Geteilte Videos konnten nicht geladen werden'
        });
    }
});

// GET /api/subtitler/share/:shareToken - Get share info for preview (public)
router.get('/:shareToken', async (req, res) => {
    try {
        const { shareToken } = req.params;
        const service = await getShareService();
        const share = await service.getShareByToken(shareToken);

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Geteiltes Video nicht gefunden'
            });
        }

        if (share.expired) {
            return res.status(410).json({
                success: false,
                error: 'Link abgelaufen',
                expired: true
            });
        }

        // Return public info for preview
        res.json({
            success: true,
            share: {
                title: share.title,
                duration: share.duration,
                thumbnailUrl: share.thumbnail_path ? `/api/subtitler/share/${shareToken}/thumbnail` : null,
                expiresAt: share.expires_at,
                downloadCount: share.download_count,
                sharerName: share.sharer_name
            }
        });

    } catch (error) {
        log.error('Failed to get share info:', error);
        res.status(500).json({
            success: false,
            error: 'Fehler beim Laden des geteilten Videos'
        });
    }
});

// GET /api/subtitler/share/:shareToken/thumbnail - Get thumbnail (public)
router.get('/:shareToken/thumbnail', async (req, res) => {
    try {
        const { shareToken } = req.params;
        const service = await getShareService();
        const share = await service.getShareByToken(shareToken);

        if (!share || share.expired || !share.thumbnail_path) {
            return res.status(404).json({ error: 'Thumbnail nicht gefunden' });
        }

        const thumbnailPath = service.getThumbnailFilePath(share.thumbnail_path);

        try {
            await fsPromises.access(thumbnailPath);
            res.sendFile(thumbnailPath);
        } catch {
            res.status(404).json({ error: 'Thumbnail-Datei nicht gefunden' });
        }

    } catch (error) {
        log.error('Failed to get thumbnail:', error);
        res.status(500).json({ error: 'Fehler beim Laden des Thumbnails' });
    }
});

// GET /api/subtitler/share/:shareToken/preview - Stream video for preview (public)
router.get('/:shareToken/preview', async (req, res) => {
    try {
        const { shareToken } = req.params;
        const service = await getShareService();
        const share = await service.getShareByToken(shareToken);

        if (!share) {
            return res.status(404).json({ error: 'Video nicht gefunden' });
        }

        if (share.expired) {
            return res.status(410).json({ error: 'Link abgelaufen' });
        }

        const videoPath = service.getVideoFilePath(share.video_path);

        try {
            const stat = await fsPromises.stat(videoPath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/mp4'
                });

                const stream = fs.createReadStream(videoPath, { start, end });
                stream.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4'
                });
                fs.createReadStream(videoPath).pipe(res);
            }
        } catch {
            res.status(404).json({ error: 'Video-Datei nicht gefunden' });
        }

    } catch (error) {
        log.error('Failed to stream preview:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Vorschau' });
    }
});

// GET /api/subtitler/share/:shareToken/download - Download shared video (auth required)
router.get('/:shareToken/download', requireAuth, async (req, res) => {
    try {
        const { shareToken } = req.params;
        const userId = req.user.id;
        const userEmail = req.user.email || 'authenticated-user';

        const service = await getShareService();
        const share = await service.getShareByToken(shareToken);

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Geteiltes Video nicht gefunden'
            });
        }

        if (share.expired) {
            return res.status(410).json({
                success: false,
                error: 'Link abgelaufen'
            });
        }

        // Record the download with user info
        const ipAddress = req.ip || req.connection.remoteAddress;
        await service.recordDownload(shareToken, userEmail, ipAddress);

        // Stream the video
        const videoPath = service.getVideoFilePath(share.video_path);

        try {
            const stat = await fsPromises.stat(videoPath);
            const fileSize = stat.size;

            const sanitizedTitle = (share.title || 'video')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .substring(0, 50);
            const filename = `${sanitizedTitle}_gruenerator.mp4`;

            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            log.info(`Download started: ${shareToken} by user ${userId} (${userEmail})`);

            const fileStream = fs.createReadStream(videoPath);
            fileStream.pipe(res);

            fileStream.on('error', (error) => {
                log.error(`Stream error for ${shareToken}: ${error.message}`);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Fehler beim Download' });
                }
            });

        } catch {
            res.status(404).json({
                success: false,
                error: 'Video-Datei nicht gefunden'
            });
        }

    } catch (error) {
        log.error('Failed to download share:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Fehler beim Download'
            });
        }
    }
});

// DELETE /api/subtitler/share/:shareToken - Delete a share (auth required)
router.delete('/:shareToken', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { shareToken } = req.params;

        const service = await getShareService();
        await service.deleteShare(userId, shareToken);

        log.info(`Share deleted: ${shareToken} by user ${userId}`);

        res.json({
            success: true,
            message: 'Geteiltes Video gelöscht'
        });

    } catch (error) {
        log.error('Failed to delete share:', error);
        if (error.message.includes('not found') || error.message.includes('not owned')) {
            res.status(404).json({
                success: false,
                error: 'Geteiltes Video nicht gefunden oder keine Berechtigung'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Geteiltes Video konnte nicht gelöscht werden'
            });
        }
    }
});

module.exports = router;
