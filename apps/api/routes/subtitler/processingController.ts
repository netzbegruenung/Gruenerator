/**
 * Subtitler Processing Controller
 * Handles video processing, transcription, and export routes.
 */

import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  autoProcessRequestSchema,
  exportRequestSchema,
  exportSegmentsRequestSchema,
  exportTokenBodySchema,
  processRequestSchema,
  resultQuerySchema,
  type AutoProcessRequest,
  type ExportRequest,
  type ExportSegmentsRequest,
  type ResultQuery,
} from '@gruenerator/contracts';
import express, { type Response, type Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { type z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getSharedMediaService } from '../../services/sharedMediaService.js';
import AssSubtitleService, {
  type TextOverlay as AssTextOverlay,
} from '../../services/subtitler/assSubtitleService.js';
import {
  processVideoAutomatically,
  type ProcessingResult,
} from '../../services/subtitler/autoProcessingService.js';
import { getCompressionStatus } from '../../services/subtitler/backgroundCompressionService.js';
import { processVideoExportInBackground } from '../../services/subtitler/backgroundExportService.js';
import {
  generateDownloadToken,
  processDirectDownload,
  processChunkedDownload,
  processSubtitleSegments,
} from '../../services/subtitler/downloadUtils.js';
import { autoSaveProject } from '../../services/subtitler/projectSavingService.js';
import {
  parseAutoProgress,
  parseExportProgress,
  parseRedisJobResult,
} from '../../services/subtitler/redisCodecs.js';
import { calculateFontSizing } from '../../services/subtitler/subtitleSizingService.js';
import { transcribeVideo } from '../../services/subtitler/transcriptionService.js';
import {
  getFilePathFromUploadId,
  checkFileExists,
  markUploadAsProcessed,
  scheduleImmediateCleanup,
  getOriginalFilename,
} from '../../services/subtitler/tusService.js';
import { getVideoMetadata } from '../../services/subtitler/videoUploadService.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { ParamsDictionary } from 'express-serve-static-core';

type ProcessRequestBody = z.infer<typeof processRequestSchema>;
type ExportBody = ExportRequest;
type ExportSegmentsRequestBody = ExportSegmentsRequest;
type AutoProcessRequestBody = AutoProcessRequest;
type ExportTokenBody = z.infer<typeof exportTokenBodySchema>;

const exportBodySchema = exportRequestSchema;
const exportTokenSchema = exportTokenBodySchema;

/**
 * The ASS-renderer's internal TextOverlay shape requires xPosition /
 * yPosition (no equivalent on the wire) and uses a narrower `type` enum.
 * A correct adapter would have to invent positions; today the data is
 * passed through and the ASS renderer's own runtime checks handle it.
 * This boundary cast is the assertion — see TS-feedback rule 4.
 */
function toAssTextOverlays(overlays: unknown[] | null | undefined): AssTextOverlay[] {
  if (!overlays) return [];
  return overlays as AssTextOverlay[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fsPromises = fs.promises;
const log = createLogger('subtitler');
const router: Router = express.Router();
const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneTypeNeue-Regular.ttf');
const assService = new AssSubtitleService();

interface SubtitlerRequest<P = ParamsDictionary> extends AuthenticatedRequest<P> {
  app: AuthenticatedRequest['app'] & { locals: { aiWorkerPool?: unknown } };
}

async function checkFont(): Promise<void> {
  try {
    await fsPromises.access(FONT_PATH);
  } catch (err: unknown) {
    log.warn(
      `Font not found, using system fallback: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// POST /process - Start video transcription
router.post(
  '/process',
  validateBody(processRequestSchema),
  async (req: TypedRequest<ProcessRequestBody>, res: Response): Promise<void> => {
    const {
      uploadId,
      subtitlePreference = 'manual',
      stylePreference = 'standard',
      heightPreference = 'tief',
    } = req.body;

    const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;

    try {
      await redisClient.set(jobKey, JSON.stringify({ status: 'processing' }), { EX: 86400 });
    } catch (_e: unknown) {
      res.status(500).json({ error: 'Redis error' });
      return;
    }

    try {
      const videoPath = getFilePathFromUploadId(uploadId);
      if (!(await checkFileExists(videoPath))) {
        void scheduleImmediateCleanup(uploadId, 'file not found');
        await redisClient.set(
          jobKey,
          JSON.stringify({ status: 'error', data: 'Video nicht gefunden' }),
          { EX: 86400 }
        );
        res.status(404).json({ error: 'Video nicht gefunden' });
        return;
      }

      const aiWorkerPool: unknown = req.app.locals.aiWorkerPool;
      transcribeVideo(
        videoPath,
        subtitlePreference,
        aiWorkerPool as Parameters<typeof transcribeVideo>[2]
      )
        .then(async (subtitles) => {
          if (!subtitles) throw new Error('Keine Untertitel generiert');
          markUploadAsProcessed(uploadId);
          await redisClient.set(jobKey, JSON.stringify({ status: 'complete', data: subtitles }), {
            EX: 86400,
          });
        })
        .catch(async (error: Error) => {
          reportBackgroundError(error, { job: 'subtitler-transcription', uploadId });
          void scheduleImmediateCleanup(uploadId, 'transcription error');
          await redisClient.set(jobKey, JSON.stringify({ status: 'error', data: error.message }), {
            EX: 86400,
          });
        })
        // Terminal catch: if the error handler itself fails (e.g. Redis
        // down), the job would silently stay "processing" for 24h.
        .catch((handlerError: unknown) =>
          log.error('[subtitler-transcription] error handler failed:', handlerError)
        );

      res.status(202).json({ success: true, status: 'processing', uploadId });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await redisClient.set(jobKey, JSON.stringify({ status: 'error', data: errMsg }), {
        EX: 86400,
      });
      if (!res.headersSent) res.status(500).json({ error: errMsg });
    }
  }
);

// GET /result/:uploadId - Get transcription result
router.get(
  '/result/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    const queryResult = resultQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: 'Ungültige Query-Parameter' });
      return;
    }
    const query: ResultQuery = queryResult.data;
    const subtitlePreference = query.subtitlePreference ?? 'manual';
    const stylePreference = query.stylePreference ?? 'standard';
    const heightPreference = query.heightPreference ?? 'tief';
    const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;

    try {
      const raw = (await redisClient.get(jobKey)) as string | null;
      if (!raw) {
        res.status(404).json({ status: 'not_found' });
        return;
      }
      const job = parseRedisJobResult(raw, `result:${uploadId}`);
      if (!job) {
        res.status(500).json({ error: 'Job-Status konnte nicht gelesen werden' });
        return;
      }
      const compression = await getCompressionStatus(uploadId);
      res.json({
        status: job.status,
        subtitles: job.data,
        compression,
        ...(job.status === 'error' && { error: job.data }),
      });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// GET /export-progress/:exportToken
router.get(
  '/export-progress/:exportToken',
  async (req: SubtitlerRequest<{ exportToken: string }>, res: Response): Promise<void> => {
    const { exportToken } = req.params;
    try {
      const raw = (await redisClient.get(`export:${exportToken}`)) as string | null;
      if (!raw) {
        res.status(404).json({ status: 'not_found' });
        return;
      }
      const progress = parseExportProgress(raw, `export-progress:${exportToken}`);
      if (!progress) {
        res.status(500).json({ error: 'Export-Status konnte nicht gelesen werden' });
        return;
      }
      res.json(progress);
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
    void scheduleImmediateCleanup(uploadId, 'manual cleanup');
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
router.delete('/cleanup/:uploadId', handleCleanup);
router.post('/cleanup/:uploadId', handleCleanup);

// POST /export-token
router.post(
  '/export-token',
  validateBody(exportTokenSchema),
  async (req: TypedRequest<ExportTokenBody>, res: Response): Promise<void> => {
    try {
      res.json({ success: true, ...(await generateDownloadToken(req.body)) });
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// GET /download/:token
router.get(
  '/download/:token',
  async (req: SubtitlerRequest<{ token: string }>, res: Response): Promise<void> => {
    try {
      await processDirectDownload(req.params.token, res);
    } catch (e: unknown) {
      if (!res.headersSent)
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
    } catch (e: unknown) {
      if (!res.headersSent)
        res.status(404).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// GET /export-download/:exportToken
router.get(
  '/export-download/:exportToken',
  async (req: SubtitlerRequest<{ exportToken: string }>, res: Response): Promise<void> => {
    const { exportToken } = req.params;
    try {
      const raw = (await redisClient.get(`export:${exportToken}`)) as string | null;
      if (!raw) {
        res.status(404).json({ error: 'Export not found' });
        return;
      }
      const exportData = parseExportProgress(raw, `export-download:${exportToken}`);
      if (!exportData) {
        res.status(500).json({ error: 'Export-Daten konnten nicht gelesen werden' });
        return;
      }
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
      setContentDisposition(res, filename);

      const stream = fs.createReadStream(exportData.outputPath);
      stream.pipe(res);
      stream.on('error', (err) => {
        log.error(`Stream error for export ${exportToken}: ${err.message}`);
        if (!res.headersSent) res.status(500).end();
      });
    } catch (e: unknown) {
      if (!res.headersSent)
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
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
    } catch (e: unknown) {
      if (!res.headersSent)
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// POST /export - Export video with subtitles
router.post(
  '/export',
  validateBody(exportBodySchema),
  async (req: TypedRequest<ExportBody>, res: Response): Promise<void> => {
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
          .map((s) => ({
            startTime: Number(s['start'] ?? s['startTime'] ?? 0),
            endTime: Number(s['end'] ?? s['endTime'] ?? 0),
            text: String(s['text'] ?? ''),
          }))
          .filter((s) => s.text && s.endTime > s.startTime)
          .sort((a, b) => a.startTime - b.startTime);
        if (segments.length === 0) {
          throw new Error('Keine gültigen Untertitel-Segmente gefunden');
        }
      } else if (subtitles) {
        segments = processSubtitleSegments(subtitles);
      } else {
        segments = [];
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
          const duration =
            typeof metadata.duration === 'string'
              ? parseFloat(metadata.duration)
              : metadata.duration;
          const assMetadata = {
            width: metadata.width,
            height: metadata.height,
            ...(duration != null && { duration }),
          };
          assContent = assService.generateAssContent(
            segments,
            assMetadata,
            opts,
            subtitlePreference,
            stylePreference,
            locale,
            heightPreference,
            toAssTextOverlays(textOverlays)
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

      const exportSegments = segments.map(
        (s: { text: string; startTime: number; endTime: number }) => ({
          text: s.text,
          start: s.startTime,
          end: s.endTime,
        })
      );
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
        textOverlays: toAssTextOverlays(textOverlays),
      })
        .catch((e: Error) =>
          reportBackgroundError(e, {
            job: 'subtitler-export',
            exportToken,
            uploadId: uploadId || '',
          })
        )
        .catch((handlerError: unknown) =>
          log.error('[subtitler-export] error handler failed:', handlerError)
        );
    } catch (e: unknown) {
      if (!res.headersSent)
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// POST /export-segments
router.post(
  '/export-segments',
  validateBody(exportSegmentsRequestSchema),
  async (req: TypedRequest<ExportSegmentsRequestBody>, res: Response): Promise<void> => {
    const { uploadId, projectId, segments, includeSubtitles, subtitleConfig } = req.body;
    if (!uploadId && !projectId) {
      res.status(400).json({ error: 'Upload-ID oder Projekt-ID benötigt' });
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
      const resolvedProjectId = projectId || uploadId;
      const result =
        includeSubtitles && subtitleConfig
          ? await svc.exportWithSegmentsAndSubtitles(videoPath, segments, subtitleConfig, {
              ...(resolvedProjectId != null && { projectId: resolvedProjectId }),
            })
          : await svc.exportWithSegments(videoPath, segments, {
              ...(resolvedProjectId != null && { projectId: resolvedProjectId }),
            });
      res.status(202).json({ exportToken: result.exportToken, segmentCount: result.segmentCount });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// POST /process-auto
router.post(
  '/process-auto',
  validateBody(autoProcessRequestSchema),
  async (req: TypedRequest<AutoProcessRequestBody>, res: Response): Promise<void> => {
    const { uploadId, locale = 'de-DE', maxResolution = null, userId = null } = req.body;

    try {
      const videoPath = getFilePathFromUploadId(uploadId);
      if (!(await checkFileExists(videoPath))) {
        res.status(404).json({ error: 'Video nicht gefunden' });
        return;
      }
      const originalFilename = (await getOriginalFilename(uploadId)) || 'video.mp4';

      await redisClient.set(
        `auto:${uploadId}`,
        JSON.stringify({ status: 'processing', stage: 1, stageProgress: 0, overallProgress: 0 }),
        { EX: 3600 }
      );

      res.status(202).json({ status: 'processing' });

      processVideoAutomatically(videoPath, uploadId, {
        stylePreference: 'shadow',
        heightPreference: 'tief',
        locale,
        maxResolution,
        ...(userId != null && { userId }),
        originalFilename,
      })
        .then(async (result: ProcessingResult) => {
          let savedProjectId: string | null = null;
          if (userId) {
            try {
              const r = await autoSaveProject({
                userId,
                outputPath: result.outputPath,
                originalVideoPath: videoPath,
                uploadId,
                originalFilename,
                segments: result.segments,
                metadata: result.metadata,
                stylePreference: 'shadow',
                heightPreference: 'tief',
                subtitlePreference: 'manual',
                exportToken: result.autoProcessToken,
              });
              savedProjectId = r.projectId;
            } catch {
              /* ignored */
            }

            if (savedProjectId && result.outputPath) {
              try {
                const shareService = getSharedMediaService();
                await shareService.createVideoShare(userId, {
                  videoPath: result.outputPath,
                  title: originalFilename.replace(/\.[^.]+$/, ''),
                  duration: result.duration,
                  projectId: savedProjectId,
                });
              } catch (shareErr: unknown) {
                log.warn(
                  `Auto-share creation failed: ${shareErr instanceof Error ? shareErr.message : String(shareErr)}`
                );
              }
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
              projectId: savedProjectId,
              // Canonical segment array — what the frontend should consume
              // when creating a project. The `subtitles` string is kept for
              // backward compatibility with any display-layer code that
              // wants the raw SRT blob, but the POST /subtitler/projects
              // write path uses `segments` because the schema requires a
              // typed `SubtitleSegment[]` (canonicalized 2026-04-13).
              segments: result.segments,
              subtitles: result.subtitles,
            }),
            { EX: 3600 }
          );
        })
        .catch((e: Error) => reportBackgroundError(e, { job: 'subtitler-auto-process', uploadId }));
    } catch (e: unknown) {
      if (!res.headersSent)
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// GET /auto-progress/:uploadId
router.get(
  '/auto-progress/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const raw = (await redisClient.get(`auto:${uploadId}`)) as string | null;
      if (!raw) {
        res.status(404).json({ status: 'not_found' });
        return;
      }
      const progress = parseAutoProgress(raw, `auto-progress:${uploadId}`);
      if (!progress) {
        res.status(500).json({ error: 'Auto-Status konnte nicht gelesen werden' });
        return;
      }
      res.json(progress);
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

// GET /auto-download/:uploadId
router.get(
  '/auto-download/:uploadId',
  async (req: SubtitlerRequest<{ uploadId: string }>, res: Response): Promise<void> => {
    const { uploadId } = req.params;
    try {
      const raw = (await redisClient.get(`auto:${uploadId}`)) as string | null;
      if (!raw) {
        res.status(404).json({ error: 'Nicht gefunden' });
        return;
      }
      const parsed = parseAutoProgress(raw, `auto-download:${uploadId}`);
      if (!parsed) {
        res.status(500).json({ error: 'Auto-Daten konnten nicht gelesen werden' });
        return;
      }
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
      setContentDisposition(res, `video_${uploadId}_gruenerator.mp4`);
      fs.createReadStream(parsed.outputPath).pipe(res);
    } catch (e: unknown) {
      if (!res.headersSent)
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
);

export default router;
