/**
 * Share Controller
 * Handles sharing of images and videos with public links
 */

import express, { Request, Response, Router } from 'express';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { SharedMediaRow, ShareResult } from '../../types/media.js';

const fsPromises = fs.promises;
const log = createLogger('share');

// ============================================================================
// Types
// ============================================================================

interface CamelCaseObject {
  [key: string]: unknown;
}

interface ExportData {
  status: string;
  outputPath: string;
  duration?: number;
}

interface Project {
  id?: string;
  video_path?: string;
  thumbnail_path?: string;
  subtitled_video_path?: string;
  subtitles?: unknown;
  title?: string;
  video_metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
  style_preference?: string;
  height_preference?: string;
}

interface SharedMediaService {
  ensureInitialized(): Promise<void>;
  createImageShare(userId: string, params: CreateImageShareParams): Promise<ShareResult>;
  createVideoShare(userId: string, params: CreateVideoShareParams): Promise<ShareResult>;
  createPendingVideoShare(userId: string, params: CreatePendingVideoShareParams): Promise<ShareResult>;
  getUserShares(userId: string, type: string | null): Promise<SharedMediaRow[]>;
  getUserShareCount(userId: string): Promise<number>;
  getShareByToken(shareToken: string): Promise<SharedMediaRow | null>;
  recordView(shareToken: string): Promise<void>;
  recordDownload(shareToken: string, email: string, ip: string): Promise<void>;
  deleteShare(userId: string, shareToken: string): Promise<void>;
  finalizeVideoShare(shareToken: string, videoPath: string): Promise<void>;
  markShareFailed(shareToken: string): Promise<void>;
  updateImageShare(userId: string, shareToken: string, params: UpdateImageShareParams): Promise<ShareResult>;
  getThumbnailFilePath(relativePath: string): string;
  getMediaFilePath(relativePath: string): string;
  getOriginalImagePath(shareToken: string, filename: string): string;
  markAsTemplate(userId: string, shareToken: string, title: string, visibility: string, userName: string): Promise<void>;
  cloneTemplate(templateToken: string, userId: string, userName: string): Promise<ShareResult>;
  getTemplates(userId: string | null, visibility: string): Promise<SharedMediaRow[]>;
  getTemplateByToken(templateToken: string, requestingUserId?: string): Promise<SharedMediaRow | null>;
}

interface ProjectService {
  ensureInitialized(): Promise<void>;
  getProject(userId: string, projectId: string): Promise<Project>;
  getVideoPath(relativePath: string): string;
  getSubtitledVideoPath(relativePath: string): string;
  getThumbnailPath(relativePath: string): string;
  updateSubtitledVideoPath(userId: string, projectId: string, relativePath: string): Promise<void>;
}

interface CreateImageShareParams {
  imageBase64: string;
  title: string;
  imageType: string | null;
  metadata: Record<string, unknown>;
  originalImage: string | null;
}

interface CreateVideoShareParams {
  videoPath: string;
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string | null;
}

interface CreatePendingVideoShareParams {
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string;
}

interface UpdateImageShareParams {
  imageBase64: string;
  title?: string;
  metadata: Record<string, unknown>;
  originalImage?: string | null;
}

interface ImageShareRequest extends AuthenticatedRequest {
  body: {
    imageData: string;
    title?: string;
    imageType?: string;
    metadata?: Record<string, unknown>;
    originalImage?: string;
  };
}

interface VideoShareRequest extends AuthenticatedRequest {
  body: {
    exportToken: string;
    title?: string;
    projectId?: string;
  };
}

interface VideoFromProjectRequest extends AuthenticatedRequest {
  body: {
    projectId: string;
    title?: string;
  };
}

interface ShareTokenParams {
  shareToken: string;
  [key: string]: string;
}

type UpdateImageRequest = Request<ShareTokenParams, unknown, {
  imageBase64: string;
  title?: string;
  metadata?: Record<string, unknown>;
  originalImage?: string;
}> & { user?: AuthenticatedRequest['user'] };

interface ShareResponse {
  success: boolean;
  share?: {
    shareToken: string;
    shareUrl: string;
    createdAt: Date | string;
    mediaType: 'image' | 'video';
    hasOriginalImage?: boolean;
    status?: string;
  };
  error?: string;
  code?: string;
}

interface ShareListResponse {
  success: boolean;
  shares?: CamelCaseObject[];
  count?: number;
  limit?: number;
  error?: string;
}

interface ShareInfoResponse {
  success: boolean;
  share?: {
    mediaType: string;
    title: string | null;
    thumbnailUrl: string | null;
    downloadCount: number;
    viewCount: number;
    sharerName?: string;
    status: string;
    createdAt: Date;
    duration?: number | null;
    imageType?: string | null;
    dimensions?: {
      width?: number;
      height?: number;
    };
  };
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function toCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).reduce<CamelCaseObject>((acc, [key, value]) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      acc[camelKey] = toCamelCase(value);
      return acc;
    }, {});
  }
  return obj;
}

// Lazy-loaded services
let sharedMediaService: SharedMediaService | null = null;
let projectService: ProjectService | null = null;

async function getSharedMediaService(): Promise<SharedMediaService> {
  if (!sharedMediaService) {
    const { getSharedMediaService: getService } = await import('../../services/sharedMediaService.js');
    sharedMediaService = getService() as unknown as SharedMediaService;
    await sharedMediaService.ensureInitialized();
  }
  return sharedMediaService;
}

async function getProjectService(): Promise<ProjectService> {
  if (!projectService) {
    const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
    projectService = getSubtitlerProjectService() as unknown as ProjectService;
    await projectService.ensureInitialized();
  }
  return projectService;
}

async function triggerBackgroundRender(
  userId: string,
  projectId: string,
  shareToken: string,
  project: Project
): Promise<void> {
  try {
    const projService = await getProjectService();
    const { processProjectExport } = await import('../../services/subtitler/exportService.js');

    log.info(`Background render starting for share ${shareToken}`);

    const result = await processProjectExport(project as any, projService);

    const subtitledVideoRelativePath = `${userId}/${projectId}/subtitled_${Date.now()}.mp4`;
    const subtitledVideoFullPath = projService.getSubtitledVideoPath(subtitledVideoRelativePath);

    await fsPromises.mkdir(path.dirname(subtitledVideoFullPath), { recursive: true });
    await fsPromises.copyFile(result.outputPath, subtitledVideoFullPath);
    await projService.updateSubtitledVideoPath(userId, projectId, subtitledVideoRelativePath);

    const service = await getSharedMediaService();
    await service.finalizeVideoShare(shareToken, subtitledVideoFullPath);

    try {
      await fsPromises.unlink(result.outputPath);
    } catch {
      // Ignore cleanup errors
    }

    log.info(`Background render complete for share ${shareToken}`);

  } catch (error) {
    log.error(`Background render failed for ${shareToken}:`, error);
    const service = await getSharedMediaService();
    await service.markShareFailed(shareToken);
  }
}

// ============================================================================
// Router Setup
// ============================================================================

const router: Router = express.Router();

// ============================================================================
// IMAGE SHARE ROUTES
// ============================================================================

router.post('/image', requireAuth, async (req: ImageShareRequest, res: Response<ShareResponse>) => {
  try {
    const userId = req.user!.id;
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

// ============================================================================
// VIDEO SHARE ROUTES
// ============================================================================

router.post('/video', requireAuth, async (req: VideoShareRequest, res: Response<ShareResponse>) => {
  try {
    const userId = req.user!.id;
    const { exportToken, title, projectId } = req.body;

    if (!exportToken) {
      return res.status(400).json({
        success: false,
        error: 'Export-Token wird benötigt'
      });
    }

    const exportDataString = await redisClient.get(`export:${exportToken}`) as string | null;
    if (!exportDataString) {
      return res.status(404).json({
        success: false,
        error: 'Export nicht gefunden oder abgelaufen'
      });
    }

    const exportData: ExportData = JSON.parse(exportDataString);
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

router.post('/video/from-project', requireAuth, async (req: VideoFromProjectRequest, res: Response<ShareResponse>) => {
  try {
    const userId = req.user!.id;
    const { projectId, title } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Projekt-ID wird benötigt'
      });
    }

    const projService = await getProjectService();
    let project: Project;
    try {
      project = await projService.getProject(userId, projectId);
    } catch {
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

    let thumbnailPath: string | null = null;
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

// ============================================================================
// UNIFIED ROUTES
// ============================================================================

router.get('/my', requireAuth, async (req: AuthenticatedRequest, res: Response<ShareListResponse>) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as string | undefined;

    const service = await getSharedMediaService();
    const shares = await service.getUserShares(userId, type || null);
    const count = await service.getUserShareCount(userId);

    res.json({
      success: true,
      shares: toCamelCase(shares) as CamelCaseObject[],
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

router.get('/my/images', requireAuth, async (req: AuthenticatedRequest, res: Response<ShareListResponse>) => {
  try {
    const userId = req.user!.id;
    const service = await getSharedMediaService();
    const shares = await service.getUserShares(userId, 'image');

    res.json({
      success: true,
      shares: toCamelCase(shares) as CamelCaseObject[]
    });

  } catch (error) {
    log.error('Failed to get user image shares:', error);
    res.status(500).json({
      success: false,
      error: 'Bilder konnten nicht geladen werden'
    });
  }
});

router.get('/my/videos', requireAuth, async (req: AuthenticatedRequest, res: Response<ShareListResponse>) => {
  try {
    const userId = req.user!.id;
    const service = await getSharedMediaService();
    const shares = await service.getUserShares(userId, 'video');

    res.json({
      success: true,
      shares: toCamelCase(shares) as CamelCaseObject[]
    });

  } catch (error) {
    log.error('Failed to get user video shares:', error);
    res.status(500).json({
      success: false,
      error: 'Videos konnten nicht geladen werden'
    });
  }
});

router.get('/:shareToken', async (req: Request<ShareTokenParams>, res: Response<ShareInfoResponse>) => {
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

    const response: ShareInfoResponse = {
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
      response.share!.duration = share.duration;
    } else {
      const metadata = typeof share.image_metadata === 'string'
        ? JSON.parse(share.image_metadata)
        : share.image_metadata || {};
      response.share!.imageType = share.image_type;
      response.share!.dimensions = {
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

router.get('/:shareToken/thumbnail', async (req: Request<ShareTokenParams>, res: Response) => {
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

router.get('/:shareToken/original', requireAuth, async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response) => {
  try {
    const { shareToken } = req.params;
    const userId = req.user!.id;

    const service = await getSharedMediaService();
    const share = await service.getShareByToken(shareToken);

    if (!share) {
      return res.status(404).json({ error: 'Share nicht gefunden' });
    }

    if (share.user_id !== userId) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }

    const metadata = (share.image_metadata || {}) as Record<string, unknown>;
    if (!metadata.hasOriginalImage || !metadata.originalImageFilename) {
      return res.status(404).json({ error: 'Originalbild nicht vorhanden' });
    }

    const originalPath = service.getOriginalImagePath(shareToken, metadata.originalImageFilename as string);

    try {
      const stat = await fsPromises.stat(originalPath);
      const mimeType = (metadata.originalImageFilename as string).endsWith('.jpg') ? 'image/jpeg' : 'image/png';

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

router.put('/:shareToken/image', requireAuth, async (req: Request<ShareTokenParams>, res: Response<ShareResponse>) => {
  try {
    const { shareToken } = req.params;
    const authReq = req as unknown as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const { imageBase64, title, metadata, originalImage } = req.body as {
      imageBase64: string;
      title?: string;
      metadata?: Record<string, unknown>;
      originalImage?: string;
    };

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
        createdAt: result.createdAt,
        mediaType: 'image',
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

router.get('/:shareToken/preview', async (req: Request<ShareTokenParams>, res: Response) => {
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

router.get('/:shareToken/download', requireAuth, async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response) => {
  try {
    const { shareToken } = req.params;
    const userId = req.user!.id;
    const userEmail = req.user!.email || 'authenticated-user';

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

    const ipAddress = req.ip || (req as any).connection?.remoteAddress || 'unknown';
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

      fileStream.on('error', (streamError) => {
        log.error(`Stream error for ${shareToken}: ${streamError.message}`);
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

router.delete('/:shareToken', requireAuth, async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
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
    if ((error as Error).message.includes('not found') || (error as Error).message.includes('not owned')) {
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

// ============================================================================
// Template Endpoints
// ============================================================================

/**
 * POST /:shareToken/save-as-template
 * Convert existing shared media to template
 */
router.post('/:shareToken/save-as-template', requireAuth, async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userName = req.user?.display_name || req.user?.email || 'Anonymous';
    const { shareToken } = req.params;
    const { title, visibility = 'private' } = req.body;

    if (!['private', 'unlisted', 'public'].includes(visibility)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid visibility value'
      });
    }

    const service = await getSharedMediaService();

    await service.markAsTemplate(
      userId,
      shareToken,
      title || 'Template',
      visibility,
      userName
    );

    const templateUrl = `${process.env.BASE_URL || 'http://localhost:5173'}/sharepic?template=${shareToken}`;

    log.info(`Share ${shareToken} marked as template with visibility: ${visibility} by user ${userId}`);

    res.json({
      success: true,
      templateUrl,
      shareToken,
      visibility
    });

  } catch (error) {
    log.error('Failed to save as template:', error);
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Share not found'
      });
    } else if (errorMessage.includes('Not authorized')) {
      res.status(403).json({
        success: false,
        error: 'Not authorized to mark this as template'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save as template'
      });
    }
  }
});

/**
 * POST /templates/:shareToken/clone
 * Clone template to user's gallery
 */
router.post('/templates/:shareToken/clone', requireAuth, async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userName = req.user?.display_name || req.user?.email || 'Anonymous';
    const { shareToken } = req.params;

    const service = await getSharedMediaService();
    const clonedShare = await service.cloneTemplate(
      shareToken,
      userId,
      userName
    );

    log.info(`Template ${shareToken} cloned to ${clonedShare.shareToken} by user ${userId}`);

    res.json({
      success: true,
      share: clonedShare,
      message: 'Template successfully cloned'
    });

  } catch (error) {
    log.error('Failed to clone template:', error);
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    } else if (errorMessage.includes('not accessible') || errorMessage.includes('private')) {
      res.status(403).json({
        success: false,
        error: 'Template not accessible'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to clone template'
      });
    }
  }
});

/**
 * GET /templates
 * List available templates (user's + public)
 */
router.get('/templates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { visibility } = req.query;

    const service = await getSharedMediaService();
    const templates = await service.getTemplates(userId, visibility as string);

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    log.error('Failed to get templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve templates'
    });
  }
});

/**
 * GET /templates/:shareToken
 * Get template details (for clone preparation)
 */
router.get('/templates/:shareToken', async (req: Request<ShareTokenParams> & { user?: { id: string } }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { shareToken } = req.params;

    const service = await getSharedMediaService();
    const template = await service.getTemplateByToken(
      shareToken,
      userId
    );

    res.json({
      success: true,
      template
    });

  } catch (error) {
    log.error('Failed to get template by token:', error);
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    } else if (errorMessage.includes('not accessible') || errorMessage.includes('private')) {
      res.status(403).json({
        success: false,
        error: 'Template not accessible'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve template'
      });
    }
  }
});

export default router;
