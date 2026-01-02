/**
 * Subtitler Share Controller
 * Handles video sharing operations.
 */

import express, { Response, Router } from 'express';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const fsPromises = fs.promises;
const log = createLogger('subtitler-share');
const router: Router = express.Router();

let shareService: any = null;
let projectService: any = null;

async function getShareService() {
  if (!shareService) {
    const { getSubtitlerShareService } = await import('../../services/subtitler/shareService.js');
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

async function triggerBackgroundRender(userId: string, projectId: string, shareToken: string, project: any): Promise<void> {
  try {
    const projService = await getProjectService();
    const { processProjectExport } = await import('../../services/subtitler/exportService.js');

    log.info(`Background render starting for share ${shareToken}`);
    const result = await processProjectExport(project, projService);

    const subtitledVideoRelativePath = `${userId}/${projectId}/subtitled_${Date.now()}.mp4`;
    const subtitledVideoFullPath = projService.getSubtitledVideoPath(subtitledVideoRelativePath);

    await fsPromises.mkdir(path.dirname(subtitledVideoFullPath), { recursive: true });
    await fsPromises.copyFile(result.outputPath, subtitledVideoFullPath);
    await projService.updateSubtitledVideoPath(userId, projectId, subtitledVideoRelativePath);

    const service = await getShareService();
    await service.finalizeShare(shareToken, subtitledVideoFullPath);

    try { await fsPromises.unlink(result.outputPath); } catch {}
    log.info(`Background render complete for share ${shareToken}`);
  } catch (error: any) {
    log.error(`Background render failed for ${shareToken}:`, error);
    const service = await getShareService();
    await service.markShareFailed(shareToken);
  }
}

// POST / - Create share from export token
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { exportToken, title, projectId, expiresInDays = 7 } = req.body;

    if (!exportToken) {
      res.status(400).json({ success: false, error: 'Export-Token wird benötigt' });
      return;
    }

    const exportDataString = await redisClient.get(`export:${exportToken}`) as string | null;
    if (!exportDataString) {
      res.status(404).json({ success: false, error: 'Export nicht gefunden oder abgelaufen' });
      return;
    }

    const exportData = JSON.parse(exportDataString);
    if (exportData.status !== 'complete') {
      res.status(400).json({ success: false, error: 'Export noch nicht abgeschlossen' });
      return;
    }

    try { await fsPromises.access(exportData.outputPath); } catch {
      res.status(404).json({ success: false, error: 'Export-Datei nicht gefunden' });
      return;
    }

    const service = await getShareService();
    const share = await service.createShare(userId, {
      videoPath: exportData.outputPath,
      title: title || 'Untertiteltes Video',
      thumbnailPath: null,
      duration: exportData.duration || null,
      projectId: projectId || null,
      expiresInDays
    });

    log.info(`Share created: ${share.shareToken} by user ${userId}`);
    res.json({ success: true, share: { shareToken: share.shareToken, shareUrl: share.shareUrl, expiresAt: share.expiresAt } });
  } catch (error: any) {
    log.error('Failed to create share:', error);
    res.status(500).json({ success: false, error: 'Share konnte nicht erstellt werden' });
  }
});

// POST /from-project - Create share from project
router.post('/from-project', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { projectId, title, expiresInDays = 7 } = req.body;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Projekt-ID wird benötigt' });
      return;
    }

    const projService = await getProjectService();
    let project;
    try {
      project = await projService.getProject(userId, projectId);
    } catch {
      res.status(404).json({ success: false, error: 'Projekt nicht gefunden oder keine Berechtigung' });
      return;
    }

    if (!project?.video_path) {
      res.status(404).json({ success: false, error: 'Projekt-Video nicht gefunden' });
      return;
    }

    let thumbnailPath: string | null = null;
    if (project.thumbnail_path) {
      thumbnailPath = projService.getThumbnailPath(project.thumbnail_path);
      try { await fsPromises.access(thumbnailPath); } catch { thumbnailPath = null; }
    }

    const service = await getShareService();

    // Check if we need to render
    if (!project.subtitled_video_path) {
      if (!project.subtitles) {
        res.status(400).json({ success: false, error: 'Projekt hat keine Untertitel zum Exportieren.', code: 'NO_SUBTITLES' });
        return;
      }

      const share = await service.createPendingShare(userId, {
        title: title || project.title || 'Untertiteltes Video',
        thumbnailPath,
        duration: project.video_metadata?.duration || null,
        projectId,
        expiresInDays
      });

      triggerBackgroundRender(userId, projectId, share.shareToken, project);
      res.json({ success: true, share: { shareToken: share.shareToken, shareUrl: share.shareUrl, expiresAt: share.expiresAt, status: 'rendering' } });
      return;
    }

    const videoPath = projService.getSubtitledVideoPath(project.subtitled_video_path);

    try { await fsPromises.access(videoPath); } catch {
      if (!project.subtitles) {
        res.status(400).json({ success: false, error: 'Video-Datei nicht gefunden und keine Untertitel zum Rendern.', code: 'NO_SUBTITLES' });
        return;
      }

      const share = await service.createPendingShare(userId, {
        title: title || project.title || 'Untertiteltes Video',
        thumbnailPath,
        duration: project.video_metadata?.duration || null,
        projectId,
        expiresInDays
      });

      triggerBackgroundRender(userId, projectId, share.shareToken, project);
      res.json({ success: true, share: { shareToken: share.shareToken, shareUrl: share.shareUrl, expiresAt: share.expiresAt, status: 'rendering' } });
      return;
    }

    const share = await service.createShare(userId, {
      videoPath,
      title: title || project.title || 'Untertiteltes Video',
      thumbnailPath,
      duration: project.video_metadata?.duration || null,
      projectId,
      expiresInDays
    });

    res.json({ success: true, share: { shareToken: share.shareToken, shareUrl: share.shareUrl, expiresAt: share.expiresAt, status: 'ready' } });
  } catch (error: any) {
    log.error('Failed to create share from project:', error);
    res.status(500).json({ success: false, error: 'Share konnte nicht erstellt werden' });
  }
});

// GET /my - List user shares
router.get('/my', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const service = await getShareService();
    const shares = await service.getUserShares(userId);
    res.json({ success: true, shares });
  } catch (error: any) {
    log.error('Failed to get user shares:', error);
    res.status(500).json({ success: false, error: 'Geteilte Videos konnten nicht geladen werden' });
  }
});

// GET /:shareToken - Get share info (public)
router.get('/:shareToken', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { shareToken } = req.params;
    const service = await getShareService();
    const share = await service.getShareByToken(shareToken);

    if (!share) { res.status(404).json({ success: false, error: 'Geteiltes Video nicht gefunden' }); return; }
    if (share.expired) { res.status(410).json({ success: false, error: 'Link abgelaufen', expired: true }); return; }

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
  } catch (error: any) {
    log.error('Failed to get share info:', error);
    res.status(500).json({ success: false, error: 'Fehler beim Laden des geteilten Videos' });
  }
});

// GET /:shareToken/thumbnail (public)
router.get('/:shareToken/thumbnail', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { shareToken } = req.params;
    const service = await getShareService();
    const share = await service.getShareByToken(shareToken);

    if (!share || share.expired || !share.thumbnail_path) {
      res.status(404).json({ error: 'Thumbnail nicht gefunden' });
      return;
    }

    const thumbnailPath = service.getThumbnailFilePath(share.thumbnail_path);
    try { await fsPromises.access(thumbnailPath); res.sendFile(thumbnailPath); } catch {
      res.status(404).json({ error: 'Thumbnail-Datei nicht gefunden' });
    }
  } catch (error: any) {
    log.error('Failed to get thumbnail:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Thumbnails' });
  }
});

// GET /:shareToken/preview (public)
router.get('/:shareToken/preview', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { shareToken } = req.params;
    const service = await getShareService();
    const share = await service.getShareByToken(shareToken);

    if (!share) { res.status(404).json({ error: 'Video nicht gefunden' }); return; }
    if (share.expired) { res.status(410).json({ error: 'Link abgelaufen' }); return; }
    if (share.status === 'rendering') { res.status(202).json({ status: 'rendering', message: 'Video wird noch gerendert' }); return; }
    if (share.status === 'failed') { res.status(500).json({ error: 'Video-Rendering fehlgeschlagen' }); return; }
    if (!share.video_path) { res.status(404).json({ error: 'Video-Datei nicht verfügbar' }); return; }

    const videoPath = service.getVideoFilePath(share.video_path);

    try {
      const stat = await fsPromises.stat(videoPath);
      const range = req.headers.range;

      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4' });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch {
      res.status(404).json({ error: 'Video-Datei nicht gefunden' });
    }
  } catch (error: any) {
    log.error('Failed to stream preview:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Vorschau' });
  }
});

// GET /:shareToken/download (auth required)
router.get('/:shareToken/download', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { shareToken } = req.params;
    const userId = req.user!.id;
    const userEmail = req.user!.email || 'authenticated-user';

    const service = await getShareService();
    const share = await service.getShareByToken(shareToken);

    if (!share) { res.status(404).json({ success: false, error: 'Geteiltes Video nicht gefunden' }); return; }
    if (share.expired) { res.status(410).json({ success: false, error: 'Link abgelaufen' }); return; }
    if (share.status === 'rendering') { res.status(202).json({ success: false, status: 'rendering', error: 'Video wird noch gerendert' }); return; }
    if (share.status === 'failed') { res.status(500).json({ success: false, error: 'Video-Rendering fehlgeschlagen' }); return; }
    if (!share.video_path) { res.status(404).json({ success: false, error: 'Video-Datei nicht verfügbar' }); return; }

    const ipAddress = req.ip || (req as any).connection?.remoteAddress;
    await service.recordDownload(shareToken, userEmail, ipAddress);

    const videoPath = service.getVideoFilePath(share.video_path);

    try {
      const stat = await fsPromises.stat(videoPath);
      const filename = `${(share.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)}_gruenerator.mp4`;

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      log.info(`Download started: ${shareToken} by user ${userId}`);
      fs.createReadStream(videoPath).pipe(res);
    } catch {
      res.status(404).json({ success: false, error: 'Video-Datei nicht gefunden' });
    }
  } catch (error: any) {
    log.error('Failed to download share:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Fehler beim Download' });
  }
});

// DELETE /:shareToken
router.delete('/:shareToken', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { shareToken } = req.params;

    const service = await getShareService();
    await service.deleteShare(userId, shareToken);
    log.info(`Share deleted: ${shareToken} by user ${userId}`);
    res.json({ success: true, message: 'Geteiltes Video gelöscht' });
  } catch (error: any) {
    log.error('Failed to delete share:', error);
    if (error.message.includes('not found') || error.message.includes('not owned')) {
      res.status(404).json({ success: false, error: 'Geteiltes Video nicht gefunden oder keine Berechtigung' });
    } else {
      res.status(500).json({ success: false, error: 'Geteiltes Video konnte nicht gelöscht werden' });
    }
  }
});

export default router;
