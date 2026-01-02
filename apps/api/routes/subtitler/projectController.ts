/**
 * Subtitler Project Controller
 * Handles project CRUD operations.
 */

import express, { Response, Router } from 'express';
import fs from 'fs';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import { saveOrUpdateProject } from '../../services/subtitler/projectSavingService.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const fsPromises = fs.promises;
const log = createLogger('subtitler-projects');
const router: Router = express.Router();

let projectService: any = null;

async function getProjectService() {
  if (!projectService) {
    const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
    projectService = getSubtitlerProjectService();
    await projectService.ensureInitialized();
  }
  return projectService;
}

// GET / - List user projects
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const service = await getProjectService();
    const projects = await service.getUserProjects(userId);
    res.json({ success: true, projects });
  } catch (error: any) {
    log.error('Failed to get projects:', error);
    res.status(500).json({ success: false, error: 'Projekte konnten nicht geladen werden' });
  }
});

// GET /:projectId - Get single project
router.get('/:projectId', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.params;
    const service = await getProjectService();
    const project = await service.getProject(userId, projectId);
    res.json({ success: true, project });
  } catch (error: any) {
    log.error('Failed to get project:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ success: false, error: 'Projekt nicht gefunden' });
    } else {
      res.status(500).json({ success: false, error: 'Projekt konnte nicht geladen werden' });
    }
  }
});

// POST / - Create project
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { uploadId, subtitles, title, stylePreference, heightPreference, modePreference, videoMetadata, videoFilename, videoSize } = req.body;

    if (!uploadId) {
      res.status(400).json({ success: false, error: 'Upload-ID ist erforderlich' });
      return;
    }

    const { project, isNew } = await saveOrUpdateProject(userId, {
      uploadId, subtitles, title, stylePreference, heightPreference, modePreference, videoMetadata, videoFilename, videoSize
    });

    res.status(isNew ? 201 : 200).json({ success: true, project, isNew });
  } catch (error: any) {
    log.error('Failed to create project:', error);
    res.status(500).json({ success: false, error: error.message || 'Projekt konnte nicht erstellt werden' });
  }
});

// PUT /:projectId - Update project
router.put('/:projectId', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.params;
    const updates = req.body;

    const service = await getProjectService();
    const project = await service.updateProject(userId, projectId, updates);
    log.info(`Updated project ${projectId}`);
    res.json({ success: true, project });
  } catch (error: any) {
    log.error('Failed to update project:', error);
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      res.status(404).json({ success: false, error: 'Projekt nicht gefunden' });
    } else {
      res.status(500).json({ success: false, error: 'Projekt konnte nicht aktualisiert werden' });
    }
  }
});

// DELETE /:projectId - Delete project
router.delete('/:projectId', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.params;

    const service = await getProjectService();
    await service.deleteProject(userId, projectId);
    log.info(`Deleted project ${projectId}`);
    res.json({ success: true });
  } catch (error: any) {
    log.error('Failed to delete project:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ success: false, error: 'Projekt nicht gefunden' });
    } else {
      res.status(500).json({ success: false, error: 'Projekt konnte nicht gelöscht werden' });
    }
  }
});

// GET /:projectId/video - Stream project video
router.get('/:projectId/video', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
        'Content-Type': 'video/mp4'
      });

      fs.createReadStream(videoPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error: any) {
    log.error('Failed to stream video:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Video konnte nicht gestreamt werden' });
    }
  }
});

// GET /:projectId/thumbnail - Get project thumbnail
router.get('/:projectId/thumbnail', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
  } catch (error: any) {
    log.error('Failed to get thumbnail:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Thumbnail konnte nicht geladen werden' });
    }
  }
});

// POST /:projectId/export - Track export
router.post('/:projectId/export', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.params;

    const service = await getProjectService();
    await service.incrementExportCount(userId, projectId);
    res.json({ success: true });
  } catch (error: any) {
    log.error('Failed to track export:', error);
    res.status(500).json({ success: false, error: 'Export konnte nicht getrackt werden' });
  }
});

export default router;
