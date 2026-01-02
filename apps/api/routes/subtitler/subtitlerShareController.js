import express from 'express';
const router = express.Router();
import path from 'path';
import fs from 'fs';
const fsPromises = fs.promises;
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/index.js';

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
        const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
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

// Background render function for share creation
async function triggerBackgroundRender(userId, projectId, shareToken, project) {
    try {
        const projService = await getProjectService();
        const { processProjectExport } = await import('./services/exportService.js');

        log.info(`Background render starting for share ${shareToken}`);

        const result = await processProjectExport(project, projService);

        const subtitledVideoRelativePath = `${userId}/${projectId}/subtitled_${Date.now()}.mp4`;
        const subtitledVideoFullPath = projService.getSubtitledVideoPath(subtitledVideoRelativePath);

        await fsPromises.mkdir(path.dirname(subtitledVideoFullPath), { recursive: true });
        await fsPromises.copyFile(result.outputPath, subtitledVideoFullPath);
        await projService.updateSubtitledVideoPath(userId, projectId, subtitledVideoRelativePath);

        const service = await getShareService();
        await service.finalizeShare(shareToken, subtitledVideoFullPath);

        try {
            await fsPromises.unlink(result.outputPath);
        } catch {}

        log.info(`Background render complete for share ${shareToken}`);

    } catch (error) {
        log.error(`Background render failed for ${shareToken}:`, error);
        const service = await getShareService();
        await service.markShareFailed(shareToken);
    }
}

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

        const service = await getShareService();

        if (!project.subtitled_video_path) {
            if (!project.subtitles) {
                return res.status(400).json({
                    success: false,
                    error: 'Projekt hat keine Untertitel zum Exportieren.',
                    code: 'NO_SUBTITLES'
                });
            }

            const share = await service.createPendingShare(userId, {
                title: title || project.title || 'Untertiteltes Video',
                thumbnailPath: thumbnailPath,
                duration: project.video_metadata?.duration || null,
                projectId: projectId,
                expiresInDays
            });

            triggerBackgroundRender(userId, projectId, share.shareToken, project);

            log.info(`Share created (rendering): ${share.shareToken} for project ${projectId} by user ${userId}`);

            return res.json({
                success: true,
                share: {
                    shareToken: share.shareToken,
                    shareUrl: share.shareUrl,
                    expiresAt: share.expiresAt,
                    status: 'rendering'
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

            const share = await service.createPendingShare(userId, {
                title: title || project.title || 'Untertiteltes Video',
                thumbnailPath: thumbnailPath,
                duration: project.video_metadata?.duration || null,
                projectId: projectId,
                expiresInDays
            });

            triggerBackgroundRender(userId, projectId, share.shareToken, project);

            log.info(`Share created (re-rendering): ${share.shareToken} for project ${projectId} by user ${userId}`);

            return res.json({
                success: true,
                share: {
                    shareToken: share.shareToken,
                    shareUrl: share.shareUrl,
                    expiresAt: share.expiresAt,
                    status: 'rendering'
                }
            });
        }

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
                expiresAt: share.expiresAt,
                status: 'ready'
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
                sharerName: share.sharer_name,
                status: share.status || 'ready'
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

        if (share.status === 'rendering') {
            return res.status(202).json({
                status: 'rendering',
                message: 'Video wird noch gerendert'
            });
        }

        if (share.status === 'failed') {
            return res.status(500).json({ error: 'Video-Rendering fehlgeschlagen' });
        }

        if (!share.video_path) {
            return res.status(404).json({ error: 'Video-Datei nicht verfügbar' });
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

        if (share.status === 'rendering') {
            return res.status(202).json({
                success: false,
                status: 'rendering',
                error: 'Video wird noch gerendert. Bitte warte einen Moment.'
            });
        }

        if (share.status === 'failed') {
            return res.status(500).json({
                success: false,
                error: 'Video-Rendering fehlgeschlagen'
            });
        }

        if (!share.video_path) {
            return res.status(404).json({
                success: false,
                error: 'Video-Datei nicht verfügbar'
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

export default router;