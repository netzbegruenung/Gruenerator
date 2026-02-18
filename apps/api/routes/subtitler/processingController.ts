/**
 * Subtitler Processing Controller
 * Handles video processing, transcription, and export routes.
 */

import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import express, { type Response, type Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

import AssSubtitleService from '../../services/subtitler/assSubtitleService.js';
import { processVideoAutomatically } from '../../services/subtitler/autoProcessingService.js';
import { getCompressionStatus } from '../../services/subtitler/backgroundCompressionService.js';
import {
  processVideoExportInBackground,
  setRedisStatus,
} from '../../services/subtitler/backgroundExportService.js';
import {
  generateDownloadToken,
  processDirectDownload,
  processChunkedDownload,
  processSubtitleSegments,
} from '../../services/subtitler/downloadUtils.js';
import { autoSaveProject } from '../../services/subtitler/projectSavingService.js';
import { correctSubtitlesViaAI } from '../../services/subtitler/subtitleCorrectionService.js';
import { calculateFontSizing } from '../../services/subtitler/subtitleSizingService.js';
import { transcribeVideo } from '../../services/subtitler/transcriptionService.js';
import {
  getFilePathFromUploadId,
  checkFileExists,
  markUploadAsProcessed,
  scheduleImmediateCleanup,
  getOriginalFilename,
} from '../../services/subtitler/tusService.js';
import { getVideoMetadata, cleanupFiles } from '../../services/subtitler/videoUploadService.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { ParamsDictionary } from 'express-serve-static-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fsPromises = fs.promises;
const log = createLogger('subtitler');
const router: Router = express.Router();
const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneTypeNeue-Regular.ttf');
const assService = new AssSubtitleService();

interface SubtitlerRequest<P = ParamsDictionary> extends AuthenticatedRequest<P> {
  app: AuthenticatedRequest['app'] & { locals: { aiWorkerPool?: any } };
}

async function checkFont(): Promise<void> {
  try {
    await fsPromises.access(FONT_PATH);
  } catch (err: any) {
    log.warn(`Font not found, using system fallback: ${err.message}`);
  }
}

// POST /process - Start video transcription
router.post('/process', async (req: SubtitlerRequest, res: Response): Promise<void> => {
  const {
    uploadId,
    subtitlePreference = 'manual',
    stylePreference = 'standard',
    heightPreference = 'tief',
  } = req.body;

  if (!uploadId) {
    res.status(400).json({ error: 'Keine Upload-ID gefunden' });
    return;
  }

  const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;

  try {
    await redisClient.set(jobKey, JSON.stringify({ status: 'processing' }), { EX: 86400 });
  } catch (e: any) {
    res.status(500).json({ error: 'Redis error' });
    return;
  }

  try {
    const videoPath = getFilePathFromUploadId(uploadId);
    if (!(await checkFileExists(videoPath))) {
      scheduleImmediateCleanup(uploadId, 'file not found');
      await redisClient.set(
        jobKey,
        JSON.stringify({ status: 'error', data: 'Video nicht gefunden' }),
        { EX: 86400 }
      );
      res.status(404).json({ error: 'Video nicht gefunden' });
      return;
    }

    const aiWorkerPool = req.app.locals.aiWorkerPool;
    transcribeVideo(videoPath, subtitlePreference, aiWorkerPool)
      .then(async (subtitles) => {
        if (!subtitles) throw new Error('Keine Untertitel generiert');
        markUploadAsProcessed(uploadId);
        await redisClient.set(jobKey, JSON.stringify({ status: 'complete', data: subtitles }), {
          EX: 86400,
        });
      })
      .catch(async (error: Error) => {
        scheduleImmediateCleanup(uploadId, 'transcription error');
        await redisClient.set(jobKey, JSON.stringify({ status: 'error', data: error.message }), {
          EX: 86400,
        });
      });

    res.status(202).json({ success: true, status: 'processing', uploadId });
  } catch (error: any) {
    await redisClient.set(jobKey, JSON.stringify({ status: 'error', data: error.message }), {
      EX: 86400,
    });
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

// GET /result/:uploadId - Get transcription result
router.get(
  '/result/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    const {
      subtitlePreference = 'manual',
      stylePreference = 'standard',
      heightPreference = 'tief',
    } = req.query;
    const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;

    try {
      const data = (await redisClient.get(jobKey)) as string | null;
      if (!data) {
        res.status(404).json({ status: 'not_found' });
        return;
      }
      const job = JSON.parse(data);
      const compression = await getCompressionStatus(uploadId as string);
      res.json({
        status: job.status,
        subtitles: job.data,
        compression,
        error: job.status === 'error' ? job.data : undefined,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /export-progress/:exportToken
router.get(
  '/export-progress/:exportToken',
  async (req: SubtitlerRequest<{ exportToken: string }>, res: Response): Promise<void> => {
    const { exportToken } = req.params;
    try {
      const data = (await redisClient.get(`export:${exportToken}`)) as string | null;
      if (!data) {
        res.status(404).json({ status: 'not_found' });
        return;
      }
      res.json(JSON.parse(data));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /compression-status/:uploadId
router.get(
  '/compression-status/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      res.json(await getCompressionStatus(uploadId));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// DELETE/POST /cleanup/:uploadId
async function handleCleanup(
  req: SubtitlerRequest<{ uploadId: string }>,
  res: Response
): Promise<void> {
  const { uploadId } = req.params;
  if (!uploadId) {
    res.status(400).json({ error: 'Upload-ID fehlt' });
    return;
  }
  try {
    await redisClient.set(`cancel:${uploadId}`, 'true', { EX: 300 });
    scheduleImmediateCleanup(uploadId, 'manual cleanup');
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
router.delete('/cleanup/:uploadId', handleCleanup);
router.post('/cleanup/:uploadId', handleCleanup);

// POST /export-token
router.post('/export-token', async (req: SubtitlerRequest, res: Response): Promise<void> => {
  try {
    res.json({ success: true, ...(await generateDownloadToken(req.body)) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// GET /download/:token
router.get(
  '/download/:token',
  async (req: SubtitlerRequest<{ token: string }>, res: Response): Promise<void> => {
    try {
      await processDirectDownload(req.params.token, res);
    } catch (e: any) {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

// GET /download-chunk/:uploadId/:chunkIndex
router.get(
  '/download-chunk/:uploadId/:chunkIndex',
  async (
    req: SubtitlerRequest<{ uploadId: string; chunkIndex: string }>,
    res: Response
  ): Promise<void> => {
    try {
      await processChunkedDownload(req.params.uploadId, parseInt(req.params.chunkIndex), res);
    } catch (e: any) {
      if (!res.headersSent) res.status(404).json({ error: e.message });
    }
  }
);

// GET /export-download/:exportToken
router.get(
  '/export-download/:exportToken',
  async (req: SubtitlerRequest<{ exportToken: string }>, res: Response): Promise<void> => {
    const { exportToken } = req.params;
    try {
      const data = (await redisClient.get(`export:${exportToken}`)) as string | null;
      if (!data) {
        res.status(404).json({ error: 'Export not found' });
        return;
      }
      const exportData = JSON.parse(data);
      if (exportData.status !== 'complete') {
        res.status(400).json({ error: 'Export not complete', status: exportData.status });
        return;
      }
      if (!exportData.outputPath || !(await checkFileExists(exportData.outputPath))) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const stats = await fsPromises.stat(exportData.outputPath);
      const filename =
        path
          .basename(
            exportData.originalFilename || 'video',
            path.extname(exportData.originalFilename || '')
          )
          .replace(/[^a-zA-Z0-9_-]/g, '_') + '_gruenerator.mp4';
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      const stream = fs.createReadStream(exportData.outputPath);
      stream.pipe(res);
      stream.on('error', (err) => {
        log.error(`Stream error for export ${exportToken}: ${err.message}`);
        if (!res.headersSent) res.status(500).end();
      });
    } catch (e: any) {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

// GET /internal-video/:uploadId - Internal video streaming
router.get(
  '/internal-video/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const videoPath = getFilePathFromUploadId(uploadId);
      if (!(await checkFileExists(videoPath))) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }

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
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (e: any) {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

// POST /export - Export video with subtitles
router.post('/export', async (req: SubtitlerRequest, res: Response): Promise<void> => {
  const {
    uploadId,
    subtitles,
    subtitlePreference = 'manual',
    stylePreference = 'standard',
    heightPreference = 'standard',
    locale = 'de-DE',
    maxResolution = null,
    projectId = null,
    userId = null,
    textOverlays = [],
  } = req.body;

  if (!subtitles && (!textOverlays || textOverlays.length === 0)) {
    res.status(400).json({ error: 'Untertitel oder Text-Overlays benötigt' });
    return;
  }

  const exportToken = uuidv4();
  let inputPath: string | null = null;
  let originalFilename = 'video.mp4';

  try {
    // Try project first
    if (projectId && userId) {
      try {
        const { getSubtitlerProjectService } = await import('../../services/subtitler/index.js');
        const ps = getSubtitlerProjectService();
        await ps.ensureInitialized();
        const proj = await ps.getProject(userId, projectId);
        if (proj?.video_path) {
          inputPath = ps.getVideoPath(proj.video_path);
          originalFilename = proj.video_filename || 'video.mp4';
        }
      } catch {
        /* ignored */
      }
    }
    if (!inputPath && uploadId) {
      inputPath = getFilePathFromUploadId(uploadId);
      originalFilename = await getOriginalFilename(uploadId);
    }
    if (!inputPath) {
      res.status(400).json({ error: 'Upload-ID oder Projekt-ID benötigt' });
      return;
    }
    if (!(await checkFileExists(inputPath))) {
      res.status(404).json({ error: 'Video nicht gefunden' });
      return;
    }

    await checkFont();
    const metadata = await getVideoMetadata(inputPath);
    const fileStats = await fsPromises.stat(inputPath);
    const outputDir = path.join(__dirname, '../../uploads/exports');
    await fsPromises.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(
      outputDir,
      `${path.basename(originalFilename, path.extname(originalFilename))}_${Date.now()}.mp4`
    );
    let segments: { startTime: number; endTime: number; text: string }[];
    if (Array.isArray(subtitles)) {
      segments = subtitles
        .map((s: Record<string, unknown>) => ({
          startTime: Number(s.start ?? s.startTime ?? 0),
          endTime: Number(s.end ?? s.endTime ?? 0),
          text: String(s.text ?? ''),
        }))
        .filter((s) => s.text && s.endTime > s.startTime)
        .sort((a, b) => a.startTime - b.startTime);
      if (segments.length === 0) {
        throw new Error('Keine gültigen Untertitel-Segmente gefunden');
      }
    } else {
      segments = processSubtitleSegments(subtitles);
    }
    const { finalFontSize } = calculateFontSizing(metadata, segments);

    // Generate ASS
    let assFilePath: string | null = null,
      tempFontPath: string | null = null;
    try {
      const cacheKey = `${uploadId}_${subtitlePreference}_${stylePreference}_${heightPreference}_${locale}_${metadata.width}x${metadata.height}`;
      let assContent = await assService.getCachedAssContent(cacheKey);
      if (!assContent) {
        const opts = {
          fontSize: Math.floor(finalFontSize / 2),
          marginL: 10,
          marginR: 10,
          marginV:
            subtitlePreference === 'word'
              ? Math.floor(metadata.height * 0.5)
              : heightPreference === 'tief'
                ? Math.floor(metadata.height * 0.2)
                : Math.floor(metadata.height * 0.33),
          alignment: subtitlePreference === 'word' ? 5 : 2,
        };
        const assMetadata = {
          width: metadata.width,
          height: metadata.height,
          duration:
            typeof metadata.duration === 'string'
              ? parseFloat(metadata.duration)
              : metadata.duration,
        };
        assContent = assService.generateAssContent(
          segments,
          assMetadata,
          opts,
          subtitlePreference,
          stylePreference,
          locale,
          heightPreference,
          textOverlays
        ).content;
        await assService.cacheAssContent(cacheKey, assContent);
      }
      assFilePath = await assService.createTempAssFile(assContent, uploadId || 'temp');
      const effStyle = assService.mapStyleForLocale(stylePreference, locale);
      const srcFont = assService.getFontPathForStyle(effStyle);
      tempFontPath = path.join(path.dirname(assFilePath), path.basename(srcFont));
      await fsPromises.copyFile(srcFont, tempFontPath).catch(() => {
        tempFontPath = null;
      });
    } catch {
      /* ignored */
    }

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({ status: 'exporting', progress: 0 }),
      { EX: 3600 }
    );
    res.status(202).json({ status: 'exporting', exportToken });

    const exportSegments = segments.map((s: any) => ({
      text: s.text,
      start: s.startTime,
      end: s.endTime,
    }));
    const exportMetadata = {
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration ?? '',
    };
    processVideoExportInBackground({
      inputPath,
      outputPath,
      segments: exportSegments,
      metadata: exportMetadata,
      fileStats: { size: fileStats.size },
      exportToken,
      subtitlePreference,
      stylePreference,
      heightPreference,
      locale,
      maxResolution,
      finalFontSize,
      uploadId: uploadId || '',
      originalFilename,
      assFilePath,
      tempFontPath,
      projectId,
      userId,
      textOverlays,
    }).catch((e) => log.error(`Background export failed: ${e.message}`));
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// POST /correct-subtitles
router.post('/correct-subtitles', async (req: SubtitlerRequest, res: Response): Promise<void> => {
  const { segments } = req.body;
  if (!segments?.length) {
    res.status(400).json({ error: 'Keine Segmente' });
    return;
  }
  try {
    const pool = req.app.locals.aiWorkerPool;
    if (!pool) {
      res.status(500).json({ error: 'AI-Service nicht verfügbar' });
      return;
    }
    const result = await correctSubtitlesViaAI(segments, pool);
    res.json({ corrections: result.corrections, hasCorrections: result.hasCorrections });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /export-segments
router.post('/export-segments', async (req: SubtitlerRequest, res: Response): Promise<void> => {
  const { uploadId, projectId, segments, includeSubtitles, subtitleConfig } = req.body;
  if (!uploadId && !projectId) {
    res.status(400).json({ error: 'Upload-ID oder Projekt-ID benötigt' });
    return;
  }
  if (!segments?.length) {
    res.status(400).json({ error: 'Keine Segmente' });
    return;
  }

  try {
    let videoPath: string;
    if (projectId) {
      const { default: SubtitlerProjectService } =
        await import('../../services/subtitler/ProjectService.js');
      const ps = new SubtitlerProjectService();
      const proj = await ps.getProjectById(projectId);
      if (!proj) {
        res.status(404).json({ error: 'Projekt nicht gefunden' });
        return;
      }
      videoPath = ps.getVideoPath(proj.video_path);
    } else {
      videoPath = getFilePathFromUploadId(uploadId!);
    }
    if (!(await checkFileExists(videoPath))) {
      res.status(404).json({ error: 'Video nicht gefunden' });
      return;
    }

    const svc = await import('../../services/subtitler/segmentExportService.js');
    const result =
      includeSubtitles && subtitleConfig
        ? await svc.exportWithSegmentsAndSubtitles(videoPath, segments, subtitleConfig, {
            projectId: projectId || uploadId,
          })
        : await svc.exportWithSegments(videoPath, segments, { projectId: projectId || uploadId });
    res.status(202).json({ exportToken: result.exportToken, segmentCount: result.segmentCount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /process-auto
router.post('/process-auto', async (req: SubtitlerRequest, res: Response): Promise<void> => {
  const { uploadId, locale = 'de-DE', maxResolution = null, userId = null } = req.body;
  if (!uploadId) {
    res.status(400).json({ error: 'Keine Upload-ID' });
    return;
  }

  try {
    const videoPath = getFilePathFromUploadId(uploadId);
    if (!(await checkFileExists(videoPath))) {
      res.status(404).json({ error: 'Video nicht gefunden' });
      return;
    }
    const originalFilename = (await getOriginalFilename(uploadId)) || 'video.mp4';

    res.status(202).json({ status: 'processing' });

    processVideoAutomatically(videoPath, uploadId, {
      stylePreference: 'shadow',
      heightPreference: 'tief',
      locale,
      maxResolution,
      userId,
      originalFilename,
    })
      .then(async (result: any) => {
        let projectId: string | null = null;
        if (userId) {
          try {
            const r = await autoSaveProject({
              userId,
              outputPath: result.outputPath,
              originalVideoPath: videoPath,
              uploadId,
              originalFilename,
              segments: result.subtitles || '',
              metadata: result.metadata || {},
              fileStats: undefined,
              stylePreference: 'shadow',
              heightPreference: 'tief',
              subtitlePreference: 'manual',
              exportToken: result.autoProcessToken,
            });
            projectId = r.projectId;
          } catch {
            /* ignored */
          }
        }
        await redisClient.set(
          `auto:${uploadId}`,
          JSON.stringify({
            status: 'complete',
            stage: 5,
            stageProgress: 100,
            overallProgress: 100,
            outputPath: result.outputPath,
            duration: result.duration,
            projectId,
            subtitles: result.subtitles,
          }),
          { EX: 3600 }
        );
      })
      .catch((e: Error) => log.error(`Auto-process failed: ${e.message}`));
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// GET /auto-progress/:uploadId
router.get(
  '/auto-progress/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const data = (await redisClient.get(`auto:${uploadId}`)) as string | null;
      if (!data) {
        res.status(404).json({ status: 'not_found' });
        return;
      }
      res.json(JSON.parse(data));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /auto-download/:uploadId
router.get(
  '/auto-download/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const data = (await redisClient.get(`auto:${uploadId}`)) as string | null;
      if (!data) {
        res.status(404).json({ error: 'Nicht gefunden' });
        return;
      }
      const parsed = JSON.parse(data);
      if (parsed.status !== 'complete') {
        res.status(400).json({ error: 'Nicht abgeschlossen', status: parsed.status });
        return;
      }
      if (!parsed.outputPath || !(await checkFileExists(parsed.outputPath))) {
        res.status(404).json({ error: 'Datei nicht gefunden' });
        return;
      }

      const stats = await fsPromises.stat(parsed.outputPath);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', stats.size);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=video_${uploadId}_gruenerator.mp4`
      );
      fs.createReadStream(parsed.outputPath).pipe(res);
    } catch (e: any) {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

export default router;
