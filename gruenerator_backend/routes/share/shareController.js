const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { requireAuth } = require('../../middleware/authMiddleware');
const { createLogger } = require('../../utils/logger.js');
const redisClient = require('../../utils/redisClient');

const log = createLogger('share');

function toCamelCase(obj) {
    if (Array.isArray(obj)) {
        return obj.map(toCamelCase);
    }
    if (obj !== null && typeof obj === 'object') {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            acc[camelKey] = toCamelCase(value);
            return acc;
        }, {});
    }
    return obj;
}

let sharedMediaService = null;
let projectService = null;

async function getSharedMediaService() {
    if (!sharedMediaService) {
        const { getSharedMediaService: getService } = await import('../../services/sharedMediaService.js');
        sharedMediaService = getService();
        await sharedMediaService.ensureInitialized();
    }
    return sharedMediaService;
}

async function getProjectService() {
    if (!projectService) {
        const { getSubtitlerProjectService } = await import('../../services/subtitlerProjectService.js');
        projectService = getSubtitlerProjectService();
        await projectService.ensureInitialized();
    }
    return projectService;
}

// Background render function for video share creation
async function triggerBackgroundRender(userId, projectId, shareToken, project) {
    try {
        const projService = await getProjectService();
        const { processProjectExport } = await import('../subtitler/services/exportService.js');

        log.info(`Background render starting for share ${shareToken}`);

        const result = await processProjectExport(project, projService);

        const subtitledVideoRelativePath = `${userId}/${projectId}/subtitled_${Date.now()}.mp4`;
        const subtitledVideoFullPath = projService.getSubtitledVideoPath(subtitledVideoRelativePath);

        await fsPromises.mkdir(path.dirname(subtitledVideoFullPath), { recursive: true });
        await fsPromises.copyFile(result.outputPath, subtitledVideoFullPath);
        await projService.updateSubtitledVideoPath(userId, projectId, subtitledVideoRelativePath);

        const service = await getSharedMediaService();
        await service.finalizeVideoShare(shareToken, subtitledVideoFullPath);

        try {
            await fsPromises.unlink(result.outputPath);
        } catch {}

        log.info(`Background render complete for share ${shareToken}`);

    } catch (error) {
        log.error(`Background render failed for ${shareToken}:`, error);
        const service = await getSharedMediaService();
        await service.markShareFailed(shareToken);
    }
}

// =============================================================================
// IMAGE SHARE ROUTES
// =============================================================================

// POST /api/share/image - Create image share (auth required)
router.post('/image', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { imageData, title, imageType, metadata, originalImage } = req.body;

        if (!imageData) {
            return res.status(400).json({
                success: false,
                error: 'Bilddaten werden benötigt'
            });
        }

        const service = await getSharedMediaService();
        const share = await service.createImageShare(userId, {
            imageBase64: imageData,
            title: title || 'Geteiltes Bild',
            imageType: imageType || null,
            metadata: metadata || {},
            originalImage: originalImage || null
        });

        log.info(`Image share created: ${share.shareToken} by user ${userId}${originalImage ? ' (with original)' : ''}`);

        res.json({
            success: true,
            share: {
                shareToken: share.shareToken,
                shareUrl: share.shareUrl,
                createdAt: share.createdAt,
                mediaType: 'image',
                hasOriginalImage: share.hasOriginalImage || false
            }
        });

    } catch (error) {
        log.error('Failed to create image share:', error);
        res.status(500).json({
            success: false,
            error: 'Bild konnte nicht geteilt werden'
        });
    }
});

// =============================================================================
// VIDEO SHARE ROUTES
// =============================================================================

// POST /api/share/video - Create video share from export token (auth required)
router.post('/video', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { exportToken, title, projectId } = req.body;

        if (!exportToken) {
            return res.status(400).json({
                success: false,
                error: 'Export-Token wird benötigt'
            });
        }

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

        try {
            await fsPromises.access(outputPath);
        } catch {
            return res.status(404).json({
                success: false,
                error: 'Export-Datei nicht gefunden'
            });
        }

        const service = await getSharedMediaService();
        const share = await service.createVideoShare(userId, {
            videoPath: outputPath,
            title: title || 'Geteiltes Video',
            thumbnailPath: null,
            duration: duration || null,
            projectId: projectId || null
        });

        log.info(`Video share created: ${share.shareToken} by user ${userId}`);

        res.json({
            success: true,
            share: {
                shareToken: share.shareToken,
                shareUrl: share.shareUrl,
                createdAt: share.createdAt,
                mediaType: 'video',
                status: 'ready'
            }
        });

    } catch (error) {
        log.error('Failed to create video share:', error);
        res.status(500).json({
            success: false,
            error: 'Video konnte nicht geteilt werden'
        });
    }
});

// POST /api/share/video/from-project - Create video share from saved project (auth required)
router.post('/video/from-project', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { projectId, title } = req.body;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: 'Projekt-ID wird benötigt'
            });
        }

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

        let thumbnailPath = null;
        if (project.thumbnail_path) {
            thumbnailPath = projService.getThumbnailPath(project.thumbnail_path);
            try {
                await fsPromises.access(thumbnailPath);
            } catch {
                thumbnailPath = null;
            }
        }

        const service = await getSharedMediaService();

        if (!project.subtitled_video_path) {
            if (!project.subtitles) {
                return res.status(400).json({
                    success: false,
                    error: 'Projekt hat keine Untertitel zum Exportieren.',
                    code: 'NO_SUBTITLES'
                });
            }

            const share = await service.createPendingVideoShare(userId, {
                title: title || project.title || 'Geteiltes Video',
                thumbnailPath: thumbnailPath,
                duration: project.video_metadata?.duration || null,
                projectId: projectId
            });

            triggerBackgroundRender(userId, projectId, share.shareToken, project);

            log.info(`Video share created (rendering): ${share.shareToken} for project ${projectId} by user ${userId}`);

            return res.json({
                success: true,
                share: {
                    shareToken: share.shareToken,
                    shareUrl: share.shareUrl,
                    createdAt: share.createdAt,
                    mediaType: 'video',
                    status: 'processing'
                }
            });
        }

        const videoPath = projService.getSubtitledVideoPath(project.subtitled_video_path);

        try {
            await fsPromises.access(videoPath);
        } catch {
            if (!project.subtitles) {
                return res.status(400).json({
                    success: false,
                    error: 'Video-Datei nicht gefunden und keine Untertitel zum Rendern.',
                    code: 'NO_SUBTITLES'
                });
            }

            const share = await service.createPendingVideoShare(userId, {
                title: title || project.title || 'Geteiltes Video',
                thumbnailPath: thumbnailPath,
                duration: project.video_metadata?.duration || null,
                projectId: projectId
            });

            triggerBackgroundRender(userId, projectId, share.shareToken, project);

            log.info(`Video share created (re-rendering): ${share.shareToken} for project ${projectId} by user ${userId}`);

            return res.json({
                success: true,
                share: {
                    shareToken: share.shareToken,
                    shareUrl: share.shareUrl,
                    createdAt: share.createdAt,
                    mediaType: 'video',
                    status: 'processing'
                }
            });
        }

        const share = await service.createVideoShare(userId, {
            videoPath: videoPath,
            title: title || project.title || 'Geteiltes Video',
            thumbnailPath: thumbnailPath,
            duration: project.video_metadata?.duration || null,
            projectId: projectId
        });

        log.info(`Video share created from project: ${share.shareToken} for project ${projectId} by user ${userId}`);

        res.json({
            success: true,
            share: {
                shareToken: share.shareToken,
                shareUrl: share.shareUrl,
                createdAt: share.createdAt,
                mediaType: 'video',
                status: 'ready'
            }
        });

    } catch (error) {
        log.error('Failed to create video share from project:', error);
        res.status(500).json({
            success: false,
            error: 'Video konnte nicht geteilt werden'
        });
    }
});

// =============================================================================
// UNIFIED ROUTES
// =============================================================================

// GET /api/share/my - List user's shares (auth required)
router.get('/my', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { type } = req.query;

        const service = await getSharedMediaService();
        const shares = await service.getUserShares(userId, type || null);
        const count = await service.getUserShareCount(userId);

        res.json({
            success: true,
            shares: toCamelCase(shares),
            count,
            limit: 50
        });

    } catch (error) {
        log.error('Failed to get user shares:', error);
        res.status(500).json({
            success: false,
            error: 'Geteilte Medien konnten nicht geladen werden'
        });
    }
});

// GET /api/share/my/images - List user's image shares only
router.get('/my/images', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const service = await getSharedMediaService();
        const shares = await service.getUserShares(userId, 'image');

        res.json({
            success: true,
            shares: toCamelCase(shares)
        });

    } catch (error) {
        log.error('Failed to get user image shares:', error);
        res.status(500).json({
            success: false,
            error: 'Bilder konnten nicht geladen werden'
        });
    }
});

// GET /api/share/my/videos - List user's video shares only
router.get('/my/videos', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const service = await getSharedMediaService();
        const shares = await service.getUserShares(userId, 'video');

        res.json({
            success: true,
            shares: toCamelCase(shares)
        });

    } catch (error) {
        log.error('Failed to get user video shares:', error);
        res.status(500).json({
            success: false,
            error: 'Videos konnten nicht geladen werden'
        });
    }
});

// GET /api/share/:shareToken - Get share info (public)
router.get('/:shareToken', async (req, res) => {
    try {
        const { shareToken } = req.params;
        const service = await getSharedMediaService();
        const share = await service.getShareByToken(shareToken);

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Geteiltes Medium nicht gefunden'
            });
        }

        await service.recordView(shareToken);

        const response = {
            success: true,
            share: {
                mediaType: share.media_type,
                title: share.title,
                thumbnailUrl: share.thumbnail_path ? `/api/share/${shareToken}/thumbnail` : null,
                downloadCount: share.download_count,
                viewCount: share.view_count,
                sharerName: share.sharer_name,
                status: share.status || 'ready',
                createdAt: share.created_at
            }
        };

        if (share.media_type === 'video') {
            response.share.duration = share.duration;
        } else {
            const metadata = typeof share.image_metadata === 'string'
                ? JSON.parse(share.image_metadata)
                : share.image_metadata || {};
            response.share.imageType = share.image_type;
            response.share.dimensions = {
                width: metadata.width,
                height: metadata.height
            };
        }

        res.json(response);

    } catch (error) {
        log.error('Failed to get share info:', error);
        res.status(500).json({
            success: false,
            error: 'Fehler beim Laden des geteilten Mediums'
        });
    }
});

// GET /api/share/:shareToken/thumbnail - Get thumbnail (public)
router.get('/:shareToken/thumbnail', async (req, res) => {
    try {
        const { shareToken } = req.params;
        const service = await getSharedMediaService();
        const share = await service.getShareByToken(shareToken);

        if (!share || !share.thumbnail_path) {
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

// GET /api/share/:shareToken/original - Serve original background image (auth required)
router.get('/:shareToken/original', requireAuth, async (req, res) => {
    try {
        const { shareToken } = req.params;
        const userId = req.user.id;

        const service = await getSharedMediaService();
        const share = await service.getShareByToken(shareToken);

        if (!share) {
            return res.status(404).json({ error: 'Share nicht gefunden' });
        }

        if (share.user_id !== userId) {
            return res.status(403).json({ error: 'Zugriff verweigert' });
        }

        const metadata = share.image_metadata || {};
        if (!metadata.hasOriginalImage || !metadata.originalImageFilename) {
            return res.status(404).json({ error: 'Originalbild nicht vorhanden' });
        }

        const originalPath = service.getOriginalImagePath(shareToken, metadata.originalImageFilename);

        try {
            const stat = await fsPromises.stat(originalPath);
            const mimeType = metadata.originalImageFilename.endsWith('.jpg') ? 'image/jpeg' : 'image/png';

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Cache-Control', 'private, max-age=3600');

            fs.createReadStream(originalPath).pipe(res);
        } catch {
            res.status(404).json({ error: 'Originalbild-Datei nicht gefunden' });
        }

    } catch (error) {
        log.error('Failed to get original image:', error);
        res.status(500).json({ error: 'Fehler beim Laden des Originalbildes' });
    }
});

// PUT /api/share/:shareToken/image - Update existing image share (auth required)
router.put('/:shareToken/image', requireAuth, async (req, res) => {
    try {
        const { shareToken } = req.params;
        const userId = req.user.id;
        const { imageBase64, title, metadata, originalImage } = req.body;

        if (!imageBase64) {
            return res.status(400).json({
                success: false,
                error: 'Bilddaten fehlen'
            });
        }

        const service = await getSharedMediaService();

        const existingShare = await service.getShareByToken(shareToken);
        if (!existingShare) {
            return res.status(404).json({
                success: false,
                error: 'Share nicht gefunden'
            });
        }

        if (existingShare.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Nur der Ersteller kann diesen Share bearbeiten'
            });
        }

        if (existingShare.media_type !== 'image') {
            return res.status(400).json({
                success: false,
                error: 'Nur Bild-Shares können aktualisiert werden'
            });
        }

        const result = await service.updateImageShare(userId, shareToken, {
            imageBase64,
            title,
            metadata: metadata || {},
            originalImage
        });

        log.info(`Image share updated: ${shareToken} by user ${userId}`);

        res.json({
            success: true,
            share: {
                shareToken: result.shareToken,
                shareUrl: result.shareUrl,
                hasOriginalImage: result.hasOriginalImage
            }
        });

    } catch (error) {
        log.error('Failed to update image share:', error);
        res.status(500).json({
            success: false,
            error: 'Bild konnte nicht aktualisiert werden'
        });
    }
});

// GET /api/share/:shareToken/preview - Stream/serve media for preview (public)
router.get('/:shareToken/preview', async (req, res) => {
    try {
        const { shareToken } = req.params;
        const service = await getSharedMediaService();
        const share = await service.getShareByToken(shareToken);

        if (!share) {
            return res.status(404).json({ error: 'Medium nicht gefunden' });
        }

        if (share.status === 'processing') {
            return res.status(202).json({
                status: 'processing',
                message: 'Medium wird noch verarbeitet'
            });
        }

        if (share.status === 'failed') {
            return res.status(500).json({ error: 'Verarbeitung fehlgeschlagen' });
        }

        if (!share.file_path) {
            return res.status(404).json({ error: 'Datei nicht verfügbar' });
        }

        const mediaPath = service.getMediaFilePath(share.file_path);

        try {
            const stat = await fsPromises.stat(mediaPath);
            const fileSize = stat.size;

            if (share.media_type === 'video') {
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

                    const stream = fs.createReadStream(mediaPath, { start, end });
                    stream.pipe(res);
                } else {
                    res.writeHead(200, {
                        'Content-Length': fileSize,
                        'Content-Type': 'video/mp4'
                    });
                    fs.createReadStream(mediaPath).pipe(res);
                }
            } else {
                res.setHeader('Content-Type', share.mime_type || 'image/png');
                res.setHeader('Content-Length', fileSize);
                res.setHeader('Cache-Control', 'public, max-age=31536000');
                fs.createReadStream(mediaPath).pipe(res);
            }
        } catch {
            res.status(404).json({ error: 'Datei nicht gefunden' });
        }

    } catch (error) {
        log.error('Failed to serve preview:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Vorschau' });
    }
});

// GET /api/share/:shareToken/download - Download media (auth required)
router.get('/:shareToken/download', requireAuth, async (req, res) => {
    try {
        const { shareToken } = req.params;
        const userId = req.user.id;
        const userEmail = req.user.email || 'authenticated-user';

        const service = await getSharedMediaService();
        const share = await service.getShareByToken(shareToken);

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Geteiltes Medium nicht gefunden'
            });
        }

        if (share.status === 'processing') {
            return res.status(202).json({
                success: false,
                status: 'processing',
                error: 'Medium wird noch verarbeitet. Bitte warte einen Moment.'
            });
        }

        if (share.status === 'failed') {
            return res.status(500).json({
                success: false,
                error: 'Verarbeitung fehlgeschlagen'
            });
        }

        if (!share.file_path) {
            return res.status(404).json({
                success: false,
                error: 'Datei nicht verfügbar'
            });
        }

        const ipAddress = req.ip || req.connection.remoteAddress;
        await service.recordDownload(shareToken, userEmail, ipAddress);

        const mediaPath = service.getMediaFilePath(share.file_path);

        try {
            const stat = await fsPromises.stat(mediaPath);
            const fileSize = stat.size;

            const sanitizedTitle = (share.title || 'media')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .substring(0, 50);

            const extension = share.media_type === 'video' ? 'mp4' : (share.mime_type === 'image/jpeg' ? 'jpg' : 'png');
            const filename = `${sanitizedTitle}_gruenerator.${extension}`;

            res.setHeader('Content-Type', share.mime_type || (share.media_type === 'video' ? 'video/mp4' : 'image/png'));
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            log.info(`Download started: ${shareToken} by user ${userId} (${userEmail})`);

            const fileStream = fs.createReadStream(mediaPath);
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
                error: 'Datei nicht gefunden'
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

// DELETE /api/share/:shareToken - Delete share (auth required)
router.delete('/:shareToken', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { shareToken } = req.params;

        const service = await getSharedMediaService();
        await service.deleteShare(userId, shareToken);

        log.info(`Share deleted: ${shareToken} by user ${userId}`);

        res.json({
            success: true,
            message: 'Geteiltes Medium gelöscht'
        });

    } catch (error) {
        log.error('Failed to delete share:', error);
        if (error.message.includes('not found') || error.message.includes('not owned')) {
            res.status(404).json({
                success: false,
                error: 'Geteiltes Medium nicht gefunden oder keine Berechtigung'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Geteiltes Medium konnte nicht gelöscht werden'
            });
        }
    }
});

module.exports = router;
