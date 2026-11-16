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
import { streamFile } from '../../utils/http/streamFile.js';
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
      const source = await service.getVideoSource(userId, projectId);

      if (!source) {
        res.status(404).json({ success: false, error: 'Video nicht gefunden' });
        return;
      }

      // Owner-scoped lookup only: a parteitag project belongs to the user, so it is served
      // from system storage as long as the media row exists (no convention access re-check;
      // a deleted speech nulls source_system_media_id and the file is gone -> 410).
      const videoPath = source.path;
      let exists = false;
      if (videoPath) {
        try {
          await fsPromises.access(videoPath);
          exists = true;
        } catch {
          exists = false;
        }
      }
      if (!videoPath || !exists) {
        // A system-storage source that is missing was removed with its speech.
        if (source.system) {
          res.status(410).json({ code: 'SOURCE_GONE', error: 'Quelle nicht mehr verfügbar' });
        } else {
          res.status(404).json({ success: false, error: 'Videodatei nicht gefunden' });
        }
        return;
      }

      const stat = await fsPromises.stat(videoPath);
      streamFile(req, res, {
        size: stat.size,
        contentType: 'video/mp4',
        open: (range) =>
          range ? fs.createReadStream(videoPath, range) : fs.createReadStream(videoPath),
        downloadName: null,
      });
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
