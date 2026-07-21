/**
 * Subtitler Project Controller — binary/streaming routes only.
 *
 * Project CRUD + track-export moved to the ts-rest contract router
 * (subtitlerContractRouter.ts). Only the binary video/thumbnail stream
 * endpoints remain here — ts-rest is JSON-only in this repo.
 */

import fs from 'fs';

import express, { type Response, type Router } from 'express';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { SubtitlerProjectService } from '../../services/subtitler/ProjectService.js';

const fsPromises = fs.promises;
const log = createLogger('subtitler-projects');
const router: Router = express.Router();

let projectService: SubtitlerProjectService | null = null;

async function getProjectService(): Promise<SubtitlerProjectService> {
  if (!projectService) {
    const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
    projectService = getSubtitlerProjectService();
    await projectService.ensureInitialized();
  }
  return projectService;
}

// GET /:projectId/video - Stream project video
router.get(
  '/:projectId/video',
  requireAuth,
  async (req: AuthenticatedRequest<{ projectId: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { projectId } = req.params;

      const service = await getProjectService();
      const videoPathRelative = await service.getVideoPathOnly(userId, projectId);

      if (!videoPathRelative) {
        res.status(404).json({ success: false, error: 'Video nicht gefunden' });
        return;
      }

      const videoPath = service.getVideoPath(videoPathRelative);

      try {
        await fsPromises.access(videoPath);
      } catch {
        res.status(404).json({ success: false, error: 'Videodatei nicht gefunden' });
        return;
      }

      const stat = await fsPromises.stat(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4',
        });

        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (error: unknown) {
      log.error('Failed to stream video:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Video konnte nicht gestreamt werden' });
      }
    }
  }
);

// GET /:projectId/thumbnail - Get project thumbnail
router.get(
  '/:projectId/thumbnail',
  requireAuth,
  async (req: AuthenticatedRequest<{ projectId: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { projectId } = req.params;

      const service = await getProjectService();
      const project = await service.getProject(userId, projectId);

      if (!project || !project.thumbnail_path) {
        res.status(404).json({ success: false, error: 'Thumbnail nicht gefunden' });
        return;
      }

      const thumbnailPath = service.getThumbnailPath(project.thumbnail_path);

      try {
        await fsPromises.access(thumbnailPath);
      } catch {
        res.status(404).json({ success: false, error: 'Thumbnail-Datei nicht gefunden' });
        return;
      }

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(thumbnailPath).pipe(res);
    } catch (error: unknown) {
      log.error('Failed to get thumbnail:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Thumbnail konnte nicht geladen werden' });
      }
    }
  }
);

export default router;
