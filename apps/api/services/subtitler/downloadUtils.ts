/**
 * Download Utilities
 *
 * Video export processing with FFmpeg, ASS subtitles, and streaming.
 */

import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { type SubtitleSegment } from '@gruenerator/contracts';
import { type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { type VideoMetadata } from '../../routes/subtitler/types.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import AssSubtitleService from './assSubtitleService.js';
import { ffmpeg } from './ffmpegWrapper.js';
import * as hwaccel from './hwaccelUtils.js';
import { calculateFontSizing } from './subtitleSizingService.js';
import { getFilePathFromUploadId, checkFileExists } from './tusService.js';
import { getVideoMetadata, cleanupFiles } from './videoUploadService.js';

const fsPromises = fs.promises;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('downloadUtils');

const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneTypeNeue-Regular.ttf');

const assService = new AssSubtitleService();

interface ExportParams {
  uploadId: string;
  subtitles: string;
  subtitlePreference?: string | undefined;
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
}

interface TokenData extends ExportParams {
  createdAt: number;
}

interface QualitySettings {
  crf: number;
  preset: string;
  tune: string;
  audioCodec: string;
  audioBitrate: string | null;
  videoCodec: string;
}

async function generateDownloadToken(
  exportParams: ExportParams
): Promise<{ downloadToken: string; downloadUrl: string }> {
  const {
    uploadId,
    subtitles,
    subtitlePreference = 'manual',
    stylePreference = 'standard',
    heightPreference = 'standard',
  } = exportParams;

  if (!uploadId || !subtitles) {
    throw new Error('Upload-ID und Untertitel werden benötigt');
  }

  const downloadToken = uuidv4();

  const tokenData: TokenData = {
    uploadId,
    subtitles,
    subtitlePreference,
    stylePreference,
    heightPreference,
    createdAt: Date.now(),
  };

  await redisClient.set(`download:${downloadToken}`, JSON.stringify(tokenData), { EX: 300 });

  log.debug(`[Download Token] Generated token ${downloadToken} for uploadId: ${uploadId}`);

  return {
    downloadToken,
    downloadUrl: `/api/subtitler/download/${downloadToken}`,
  };
}

async function processDirectDownload(token: string, res: Response): Promise<void> {
  const exportParamsString = await redisClient.get(`download:${token}`);
  if (!exportParamsString || typeof exportParamsString !== 'string') {
    throw new Error('Download-Token ungültig oder abgelaufen');
  }

  const exportParams = JSON.parse(exportParamsString) as ExportParams;
  log.debug(`[Direct Download] Processing token ${token} for uploadId: ${exportParams.uploadId}`);

  await redisClient.del(`download:${token}`);

  await processVideoExport(exportParams, res);
}

async function processChunkedDownload(
  uploadId: string,
  chunkIndex: number,
  res: Response
): Promise<void> {
  const CHUNK_SIZE = 5 * 1024 * 1024;

  const videoPath = await getProcessedVideoPath(uploadId);
  const fileExists = await checkFileExists(videoPath);

  if (!fileExists) {
    throw new Error('Video-Datei für chunked download nicht gefunden');
  }

  const stats = await fsPromises.stat(videoPath);
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE - 1, stats.size - 1);

  if (start >= stats.size) {
    res.status(416).json({ error: 'Chunk index out of range' });
    return;
  }

  res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  res.setHeader('Content-Type', 'video/mp4');

  const stream = fs.createReadStream(videoPath, { start, end });
  stream.pipe(res);

  log.debug(`[Chunked Download] Served chunk ${chunkIndex} (${start}-${end}) for ${uploadId}`);
}

async function processVideoExport(exportParams: ExportParams, res: Response): Promise<void> {
  const {
    uploadId,
    subtitles,
    subtitlePreference = 'manual',
    stylePreference = 'standard',
    heightPreference = 'standard',
  } = exportParams;

  let inputPath: string | null = null;
  let outputPath: string | null = null;
  let originalFilename = 'video.mp4';
  const exportToken = uuidv4();

  log.debug(
    `[Export] Starting export with stylePreference: ${stylePreference}, heightPreference: ${heightPreference}`
  );

  try {
    inputPath = getFilePathFromUploadId(uploadId);
    const fileExists = await checkFileExists(inputPath);
    if (!fileExists) {
      throw new Error('Zugehörige Video-Datei für Export nicht gefunden');
    }

    originalFilename = `video_${uploadId}.mp4`;

    await checkFont();
    const metadata = await getVideoMetadata(inputPath);

    if (!metadata) {
      throw new Error('Video-Metadaten konnten nicht gelesen werden');
    }

    const fileStats = await fsPromises.stat(inputPath);
    log.debug('Export-Info:', {
      uploadId,
      inputGröße: `${(fileStats.size / 1024 / 1024).toFixed(2)}MB`,
      dimensionen: `${metadata.width}x${metadata.height}`,
      rotation: metadata.rotation || 'keine',
    });

    log.debug('Starte Video-Export');
    log.debug('Video-Datei:', inputPath);

    const outputDir = path.join(__dirname, '../../uploads/exports');
    await fsPromises.mkdir(outputDir, { recursive: true });

    const outputBaseName = path.basename(originalFilename, path.extname(originalFilename));
    outputPath = path.join(
      outputDir,
      `subtitled_${outputBaseName}_${Date.now()}${path.extname(originalFilename)}`
    );
    log.debug('Ausgabepfad:', outputPath);

    const originalFormatObj = metadata.originalFormat
      ? {
          ...(metadata.originalFormat.codec ? { codec: metadata.originalFormat.codec } : {}),
          ...(metadata.originalFormat.audioCodec != null
            ? {
                audioCodec: metadata.originalFormat.audioCodec,
              }
            : {}),
          ...(metadata.originalFormat.audioBitrate != null
            ? {
                audioBitrate: metadata.originalFormat.audioBitrate,
              }
            : {}),
        }
      : undefined;

    const localMetadata: VideoMetadata = {
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration ?? 0,
      rotation: metadata.rotation,
      ...(originalFormatObj ? { originalFormat: originalFormatObj } : {}),
    };
    await processVideoWithSubtitles(
      inputPath,
      outputPath,
      subtitles,
      localMetadata,
      subtitlePreference,
      stylePreference,
      heightPreference,
      exportToken
    );

    await streamVideoFile(outputPath, originalFilename, uploadId, res);
  } catch (error: unknown) {
    log.error('Export-Fehler in downloadUtils:', error);
    if (outputPath) {
      await cleanupFiles(null, outputPath);
    }
    throw error;
  }
}

async function processVideoWithSubtitles(
  inputPath: string,
  outputPath: string,
  subtitles: string,
  metadata: VideoMetadata,
  subtitlePreference: string,
  stylePreference: string,
  heightPreference: string,
  exportToken: string
): Promise<void> {
  const segments = processSubtitleSegments(subtitles);
  const { finalFontSize } = calculateFontSizing(metadata, segments);

  const { assFilePath, tempFontPath } = await generateAssSubtitles(
    segments,
    metadata,
    subtitlePreference,
    stylePreference,
    heightPreference,
    finalFontSize
  );

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg(inputPath).setDuration(parseFloat(String(metadata.duration)) || 0);

    const { crf, preset, tune, audioCodec, audioBitrate, videoCodec } =
      calculateQualitySettings(metadata);

    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;

    const outputOptions = [
      '-y',
      '-c:v',
      videoCodec,
      '-preset',
      preset,
      '-crf',
      crf.toString(),
      '-tune',
      tune,
      '-profile:v',
      videoCodec === 'libx264' ? 'high' : 'main',
      '-level',
      videoCodec === 'libx264' ? '4.1' : '4.0',
      ...hwaccel.getCpuPixelFormatOptions(),
      '-c:a',
      audioCodec,
      ...(audioBitrate ? ['-b:a', audioBitrate] : []),
      '-movflags',
      '+faststart',
      '-avoid_negative_ts',
      'make_zero',
    ];

    if (videoCodec === 'libx264') {
      outputOptions.push(...hwaccel.getX264QualityParams());
    }

    log.debug(`[FFmpeg] Using CPU: ${referenceDimension}p, CRF: ${crf}, preset: ${preset}`);

    command.outputOptions(outputOptions);

    if (assFilePath) {
      const fontDir = path.dirname(tempFontPath || assFilePath);
      command.videoFilters([hwaccel.buildSubtitlesFilter(assFilePath, fontDir)]);
      log.debug(
        `[FFmpeg] Applied ASS filter with font directory: ${assFilePath}:fontsdir=${fontDir}`
      );
    }

    // ffmpeg fires progress events many times per second; unserialized
    // Redis writes can land after the terminal del/complete write and
    // resurrect the key as "exporting". Throttle and stop writing once
    // the job is finished.
    let lastProgressWrite = 0;
    let exportFinished = false;

    command
      .on('start', (_cmd: string) => {
        log.debug('[FFmpeg] Processing started');
      })
      .on('progress', (progress: { percent?: number; timemark?: string }) => {
        const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
        log.debug('Fortschritt:', `${progressPercent}%`);

        const now = Date.now();
        if (exportFinished || now - lastProgressWrite < 500) return;
        lastProgressWrite = now;

        const progressData = {
          status: 'exporting',
          progress: progressPercent,
          timeRemaining: progress.timemark,
        };
        redisClient
          .set(`export:${exportToken}`, JSON.stringify(progressData), { EX: 60 * 60 })
          .catch((redisError: unknown) =>
            log.warn(
              'Redis Progress Update Fehler:',
              redisError instanceof Error ? redisError.message : redisError
            )
          );
      })
      .on('error', (err: Error) => {
        exportFinished = true;
        log.error('FFmpeg Fehler:', err);

        // Await all cleanup before rejecting so temp ASS/font files are
        // not orphaned when the surrounding promise chain unwinds.
        void (async () => {
          try {
            await redisClient.del(`export:${exportToken}`);
          } catch (delErr: unknown) {
            log.warn(
              `[FFmpeg Error Cleanup] Failed to delete progress key export:${exportToken}`,
              delErr
            );
          }

          if (assFilePath) {
            try {
              await assService.cleanupTempFile(assFilePath);
            } catch (cleanupErr: unknown) {
              log.warn('[FFmpeg Error] ASS cleanup failed:', cleanupErr);
            }
            if (tempFontPath) {
              try {
                await fsPromises.unlink(tempFontPath);
              } catch (fontErr: unknown) {
                log.warn(
                  '[FFmpeg Error] Font cleanup failed:',
                  fontErr instanceof Error ? fontErr.message : fontErr
                );
              }
            }
          }

          reject(err);
        })();
      })
      .on('end', async () => {
        exportFinished = true;
        log.debug('FFmpeg Verarbeitung abgeschlossen');

        try {
          await redisClient.del(`export:${exportToken}`);
        } catch (redisError: unknown) {
          log.warn(
            'Redis Progress Cleanup Fehler:',
            redisError instanceof Error ? redisError.message : redisError
          );
        }

        if (assFilePath) {
          await assService
            .cleanupTempFile(assFilePath)
            .catch((cleanupErr: unknown) =>
              log.warn('[FFmpeg Success] ASS cleanup failed:', cleanupErr)
            );
          if (tempFontPath) {
            await fsPromises
              .unlink(tempFontPath)
              .catch((fontErr: unknown) =>
                log.warn(
                  '[FFmpeg Success] Font cleanup failed:',
                  fontErr instanceof Error ? fontErr.message : fontErr
                )
              );
          }
        }
        resolve();
      });

    command.save(outputPath);
  });
}

async function streamVideoFile(
  outputPath: string,
  originalFilename: string,
  uploadId: string,
  res: Response
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const stats = await fsPromises.stat(outputPath);
  const fileSize = stats.size;

  const sanitizedFilename =
    path
      .basename(originalFilename, path.extname(originalFilename))
      .replace(/[^a-zA-Z0-9_-]/g, '_') + '_mit_untertiteln.mp4';

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', fileSize);
  setContentDisposition(res, sanitizedFilename);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');

  const req = res.req;
  const clientInfo = {
    ip: req?.ip || (req?.socket as { remoteAddress?: string } | undefined)?.remoteAddress,
    userAgent: req?.get?.('User-Agent'),
    fileSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
  };
  log.debug(`[Export] Starting stream for ${uploadId}: ${clientInfo.fileSize} to ${clientInfo.ip}`);

  let streamedBytes = 0;
  let isClientConnected = true;
  let cleanupScheduled = false;

  const fileStream = fs.createReadStream(outputPath);

  res.on('close', () => {
    isClientConnected = false;
    log.debug(
      `[Export] Client disconnected for ${uploadId} after ${(streamedBytes / 1024 / 1024).toFixed(2)}MB`
    );
  });

  res.on('finish', () => {
    log.debug(
      `[Export] Response finished for ${uploadId}: ${(streamedBytes / 1024 / 1024).toFixed(2)}MB sent`
    );
  });

  fileStream.on('data', (chunk: Buffer) => {
    streamedBytes += chunk.length;
  });

  fileStream.pipe(res);

  const scheduleCleanup = async (reason: string) => {
    if (cleanupScheduled) return;
    cleanupScheduled = true;

    setTimeout(async () => {
      await cleanupFiles(null, outputPath);
      const success = streamedBytes === fileSize;
      log.debug(
        `[Export] Cleanup completed for ${uploadId} (${reason}): ${success ? 'SUCCESS' : 'PARTIAL'} - ${(streamedBytes / 1024 / 1024).toFixed(2)}MB/${(fileSize / 1024 / 1024).toFixed(2)}MB`
      );
    }, 2000);
  };

  fileStream.on('end', async () => {
    if (isClientConnected) {
      await scheduleCleanup('stream_end');
    } else {
      await scheduleCleanup('client_disconnected');
    }
  });

  fileStream.on('error', (error: Error) => {
    log.error(`[Export] Stream error for ${uploadId}:`, error.message);
    void scheduleCleanup('stream_error');
  });
}

async function checkFont(): Promise<void> {
  try {
    await fsPromises.access(FONT_PATH);
    log.debug('GrueneTypeNeue Font found for ASS subtitles:', FONT_PATH);
  } catch (err: unknown) {
    log.warn(
      'GrueneTypeNeue Font not found, ASS will use system fallback:',
      err instanceof Error ? err.message : err
    );
  }
}

function processSubtitleSegments(subtitles: string): SubtitleSegment[] {
  log.debug('[downloadUtils] Raw subtitles input (last 500 chars):', subtitles.slice(-500));

  const preliminarySegments = subtitles
    .split('\n\n')
    .map((block) => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return null;

      const timeLine = lines[0].trim();
      // Tolerant of 1–2 fractional digits (tenths/centiseconds); extra
      // digits are truncated. Emitters write 1 digit until Phase B.
      const timeMatch = timeLine.match(
        /^(\d{1,2}):(\d{2})\.(\d{1,2})\d*\s*-\s*(\d{1,2}):(\d{2})\.(\d{1,2})\d*$/
      );
      if (!timeMatch) return null;

      let startMin = parseInt(timeMatch[1]);
      let startSec = parseInt(timeMatch[2]);
      const startFrac = parseInt(timeMatch[3]) / 10 ** timeMatch[3].length;
      let endMin = parseInt(timeMatch[4]);
      let endSec = parseInt(timeMatch[5]);
      const endFrac = parseInt(timeMatch[6]) / 10 ** timeMatch[6].length;

      if (startSec >= 60) {
        startMin += Math.floor(startSec / 60);
        startSec = startSec % 60;
      }
      if (endSec >= 60) {
        endMin += Math.floor(endSec / 60);
        endSec = endSec % 60;
      }

      const startTime = startMin * 60 + startSec + startFrac;
      const endTime = endMin * 60 + endSec + endFrac;

      if (startTime >= endTime) return null;

      const text = lines.slice(1).join(' ').trim();
      if (!text) return null;

      return { startTime, endTime, text };
    })
    .filter((segment): segment is SubtitleSegment => segment !== null)
    .sort((a, b) => a.startTime - b.startTime);

  if (preliminarySegments.length === 0) {
    throw new Error('Keine gültigen Untertitel-Segmente gefunden');
  }

  log.debug(`[downloadUtils] Parsed ${preliminarySegments.length} segments`);
  return preliminarySegments;
}

async function generateAssSubtitles(
  segments: SubtitleSegment[],
  metadata: VideoMetadata,
  subtitlePreference: string,
  stylePreference: string,
  heightPreference: string,
  finalFontSize: number
): Promise<{ assFilePath: string | null; tempFontPath: string | null }> {
  const cacheKey = `${Date.now()}_${subtitlePreference}_${stylePreference}_${heightPreference}_${metadata.width}x${metadata.height}`;

  let assFilePath: string | null = null;
  let tempFontPath: string | null = null;

  try {
    const styleOptions = {
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
        typeof metadata.duration === 'string' ? parseFloat(metadata.duration) : metadata.duration,
    };
    const { content: assContent } = assService.generateAssContent(
      segments,
      assMetadata,
      styleOptions,
      subtitlePreference,
      stylePreference,
      'de-DE',
      heightPreference
    );

    assFilePath = await assService.createTempAssFile(assContent, cacheKey);

    tempFontPath = path.join(path.dirname(assFilePath), 'GrueneTypeNeue-Regular.ttf');
    try {
      await fsPromises.copyFile(FONT_PATH, tempFontPath);
      log.debug(`[ASS] Copied font to temp: ${tempFontPath}`);
    } catch (fontCopyError: unknown) {
      log.warn(
        '[ASS] Font copy failed, using system fallback:',
        fontCopyError instanceof Error ? fontCopyError.message : fontCopyError
      );
      tempFontPath = null;
    }

    log.debug(
      `[ASS] Created ASS file with mode: ${subtitlePreference}, style: ${stylePreference}, height: ${heightPreference}`
    );
  } catch (assError: unknown) {
    log.error('[ASS] Error generating ASS subtitles:', assError);
    assFilePath = null;
  }

  return { assFilePath, tempFontPath };
}

function calculateQualitySettings(
  metadata: VideoMetadata,
  fileSizeMB: number = 0
): QualitySettings {
  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;
  const isLargeFile = fileSizeMB > 200;

  const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
  const { crf, preset } = qualitySettings;
  const tune = 'film';

  log.debug(`[FFmpeg] ${referenceDimension}p, CRF: ${crf}, Preset: ${preset}`);

  const originalAudioCodec = metadata.originalFormat?.audioCodec;
  const originalAudioBitrate = metadata.originalFormat?.audioBitrate;

  let audioCodec: string, audioBitrate: string | null;
  if (originalAudioCodec === 'aac' && originalAudioBitrate && originalAudioBitrate >= 128) {
    audioCodec = 'copy';
    audioBitrate = null;
  } else {
    audioCodec = 'aac';
    audioBitrate = qualitySettings.audioBitrate;
  }

  let videoCodec: string;
  if (referenceDimension >= 2160 && metadata.originalFormat?.codec === 'hevc') {
    videoCodec = 'libx265';
  } else {
    videoCodec = 'libx264';
  }

  return { crf, preset, tune, audioCodec, audioBitrate, videoCodec };
}

async function getProcessedVideoPath(uploadId: string): Promise<string> {
  return getFilePathFromUploadId(uploadId);
}

export {
  generateDownloadToken,
  processDirectDownload,
  processChunkedDownload,
  processVideoExport,
  processSubtitleSegments,
};

export type { ExportParams, SubtitleSegment, VideoMetadata, QualitySettings };
