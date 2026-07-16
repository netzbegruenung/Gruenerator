/**
 * Subtitler Share Controller — binary/streaming routes only.
 *
 * Share create / from-project / list / public-info / delete moved to the
 * ts-rest contract router (subtitlerContractRouter.ts). Only the binary
 * thumbnail/preview/download stream endpoints remain here — ts-rest is
 * JSON-only in this repo.
 */

import fs from 'fs';

import express, { type Response, type Router } from 'express';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type SubtitlerShareService from '../../services/subtitler/shareService.js';

const fsPromises = fs.promises;
const log = createLogger('subtitler-share');
const router: Router = express.Router();

let shareService: SubtitlerShareService | null = null;

async function getShareService(): Promise<SubtitlerShareService> {
  if (!shareService) {
    const { getSubtitlerShareService } = await import('../../services/subtitler/shareService.js');
    shareService = getSubtitlerShareService();
    await shareService.ensureInitialized();
  }
  return shareService;
}

// GET /:shareToken/thumbnail (public)
router.get(
  '/:shareToken/thumbnail',
  async (req: AuthenticatedRequest<{ shareToken: string }>, res: Response): Promise<void> => {
    try {
      const { shareToken } = req.params;
      const service = await getShareService();
      const share = await service.getShareByToken(shareToken);

      if (!share || share.expired || !share.thumbnail_path) {
        res.status(404).json({ error: 'Thumbnail nicht gefunden' });
        return;
      }

      const thumbnailPath = service.getThumbnailFilePath(share.thumbnail_path);
      if (!thumbnailPath) {
        res.status(404).json({ error: 'Thumbnail nicht gefunden' });
        return;
      }
      try {
        await fsPromises.access(thumbnailPath);
        res.sendFile(thumbnailPath);
      } catch {
        res.status(404).json({ error: 'Thumbnail-Datei nicht gefunden' });
      }
    } catch (error: unknown) {
      log.error('Failed to get thumbnail:', error);
      res.status(500).json({ error: 'Fehler beim Laden des Thumbnails' });
    }
  }
);

// GET /:shareToken/preview (public)
router.get(
  '/:shareToken/preview',
  async (req: AuthenticatedRequest<{ shareToken: string }>, res: Response): Promise<void> => {
    try {
      const { shareToken } = req.params;
      const service = await getShareService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        res.status(404).json({ error: 'Video nicht gefunden' });
        return;
      }
      if (share.expired) {
        res.status(410).json({ error: 'Link abgelaufen' });
        return;
      }
      if (share.status === 'rendering') {
        res.status(202).json({ status: 'rendering', message: 'Video wird noch gerendert' });
        return;
      }
      if (share.status === 'failed') {
        res.status(500).json({ error: 'Video-Rendering fehlgeschlagen' });
        return;
      }
      if (!share.video_path) {
        res.status(404).json({ error: 'Video-Datei nicht verfügbar' });
        return;
      }

      const videoPath = service.getVideoFilePath(share.video_path);

      try {
        const stat = await fsPromises.stat(videoPath);
        const range = req.headers.range;

        if (range) {
          const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
          const start = parseInt(startStr, 10);
          const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': 'video/mp4',
          });
          fs.createReadStream(videoPath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
          fs.createReadStream(videoPath).pipe(res);
        }
      } catch {
        res.status(404).json({ error: 'Video-Datei nicht gefunden' });
      }
    } catch (error: unknown) {
      log.error('Failed to stream preview:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Vorschau' });
    }
  }
);

// GET /:shareToken/download (auth required)
router.get(
  '/:shareToken/download',
  requireAuth,
  async (req: AuthenticatedRequest<{ shareToken: string }>, res: Response): Promise<void> => {
    try {
      const { shareToken } = req.params;
      const userId = req.user!.id;
      const userEmail = req.user!.email || 'authenticated-user';

      const service = await getShareService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        res.status(404).json({ success: false, error: 'Geteiltes Video nicht gefunden' });
        return;
      }
      if (share.expired) {
        res.status(410).json({ success: false, error: 'Link abgelaufen' });
        return;
      }
      if (share.status === 'rendering') {
        res
          .status(202)
          .json({ success: false, status: 'rendering', error: 'Video wird noch gerendert' });
        return;
      }
      if (share.status === 'failed') {
        res.status(500).json({ success: false, error: 'Video-Rendering fehlgeschlagen' });
        return;
      }
      if (!share.video_path) {
        res.status(404).json({ success: false, error: 'Video-Datei nicht verfügbar' });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      await service.recordDownload(shareToken, userEmail, ipAddress);

      const videoPath = service.getVideoFilePath(share.video_path);

      try {
        const stat = await fsPromises.stat(videoPath);
        const filename = `${(share.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)}_gruenerator.mp4`;

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', stat.size);
        setContentDisposition(res, filename);

        log.info(`Download started: ${shareToken} by user ${userId}`);
        fs.createReadStream(videoPath).pipe(res);
      } catch {
        res.status(404).json({ success: false, error: 'Video-Datei nicht gefunden' });
      }
    } catch (error: unknown) {
      log.error('Failed to download share:', error);
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Fehler beim Download' });
    }
  }
);

export default router;
