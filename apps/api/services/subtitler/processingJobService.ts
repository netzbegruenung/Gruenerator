/**
 * Subtitler processing-job orchestration.
 *
 * Extracted from the legacy processingController so the ts-rest contract
 * handlers stay thin. Each function does all the work up to (and including)
 * kicking off the fire-and-forget background job, then returns a discriminated
 * result the contract handler maps onto a `{ status, body }` response.
 */
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { type ExportRequest, type ProcessRequest } from '@gruenerator/contracts';
import { v4 as uuidv4 } from 'uuid';

import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';

import AssSubtitleService, { type TextOverlay as AssTextOverlay } from './assSubtitleService.js';
import { processVideoExportInBackground } from './backgroundExportService.js';
import { processSubtitleSegments } from './downloadUtils.js';
import { calculateFontSizing } from './subtitleSizingService.js';
import { transcribeVideo } from './transcriptionService.js';
import {
  getFilePathFromUploadId,
  checkFileExists,
  markUploadAsProcessed,
  scheduleImmediateCleanup,
  getOriginalFilename,
} from './tusService.js';
import { getVideoMetadata } from './videoUploadService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fsPromises = fs.promises;
const log = createLogger('subtitler-processing-job');
const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneTypeNeue-Regular.ttf');
const assService = new AssSubtitleService();

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

async function checkFont(): Promise<void> {
  try {
    await fsPromises.access(FONT_PATH);
  } catch (err: unknown) {
    log.warn(
      `Font not found, using system fallback: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export type StartTranscriptionResult = { ok: true } | { ok: false; code: 404 | 500; error: string };

/**
 * Start transcription for an upload. Sets the Redis job key, fires the
 * transcription in the background (unawaited), and returns immediately.
 */
export async function startTranscriptionJob(
  body: ProcessRequest,
  aiWorkerPool: unknown
): Promise<StartTranscriptionResult> {
  const {
    uploadId,
    subtitlePreference = 'manual',
    stylePreference = 'standard',
    heightPreference = 'tief',
  } = body;

  const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;

  try {
    await redisClient.set(jobKey, JSON.stringify({ status: 'processing' }), { EX: 86400 });
  } catch (_e: unknown) {
    return { ok: false, code: 500, error: 'Redis error' };
  }

  try {
    const videoPath = getFilePathFromUploadId(uploadId);
    if (!(await checkFileExists(videoPath))) {
      void scheduleImmediateCleanup(uploadId, 'file not found');
      await redisClient.set(
        jobKey,
        JSON.stringify({ status: 'error', data: 'Video nicht gefunden' }),
        {
          EX: 86400,
        }
      );
      return { ok: false, code: 404, error: 'Video nicht gefunden' };
    }

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

    return { ok: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await redisClient.set(jobKey, JSON.stringify({ status: 'error', data: errMsg }), {
      EX: 86400,
    });
    return { ok: false, code: 500, error: errMsg };
  }
}

export type StartExportResult =
  | { ok: true; exportToken: string }
  | { ok: false; code: 400 | 404 | 500; error: string };

/**
 * Start a subtitled-video export render. Resolves the input video (project
 * or upload), generates the ASS subtitle file, seeds the Redis progress key,
 * fires the background render (unawaited), and returns the export token.
 */
export async function startSubtitledVideoExport(body: ExportRequest): Promise<StartExportResult> {
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
  } = body;

  if (!subtitles && (!textOverlays || textOverlays.length === 0)) {
    return { ok: false, code: 400, error: 'Untertitel oder Text-Overlays benötigt' };
  }

  const exportToken = uuidv4();
  let inputPath: string | null = null;
  let originalFilename = 'video.mp4';

  try {
    // Try project first
    if (projectId && userId) {
      try {
        const { getSubtitlerProjectService } = await import('./index.js');
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
      return { ok: false, code: 400, error: 'Upload-ID oder Projekt-ID benötigt' };
    }
    if (!(await checkFileExists(inputPath))) {
      return { ok: false, code: 404, error: 'Video nicht gefunden' };
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
          typeof metadata.duration === 'string' ? parseFloat(metadata.duration) : metadata.duration;
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

    return { ok: true, exportToken };
  } catch (e: unknown) {
    return { ok: false, code: 500, error: e instanceof Error ? e.message : String(e) };
  }
}
