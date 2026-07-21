/**
 * Subtitler Processing Controller — binary/streaming routes only.
 *
 * All JSON routes (process, result, export, export-segments, process-auto,
 * progress polling, cleanup, compression-status, export-token) moved to the
 * ts-rest contract router (subtitlerContractRouter.ts). Only the binary video
 * download/stream endpoints remain here — ts-rest is JSON-only in this repo.
 */

import fs from 'fs';
import path from 'path';

import express, { type Response, type Router } from 'express';

import {
  processDirectDownload,
  processChunkedDownload,
} from '../../services/subtitler/downloadUtils.js';
import { parseAutoProgress, parseExportProgress } from '../../services/subtitler/redisCodecs.js';
import { getFilePathFromUploadId, checkFileExists } from '../../services/subtitler/tusService.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { ParamsDictionary } from 'express-serve-static-core';

const fsPromises = fs.promises;
const log = createLogger('subtitler');
const router: Router = express.Router();

type SubtitlerRequest<P = ParamsDictionary> = AuthenticatedRequest<P>;

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
