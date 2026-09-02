/**
 * Auto Processing Service
 *
 * Automatically processes videos: analyzes, trims silence, generates subtitles, and exports.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { type AutoProgress, type JobErrorCode, type SubtitleSegment } from '@gruenerator/contracts';
import { v4 as uuidv4 } from 'uuid';

import { toJobError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { type Locale } from '../localization/types.js';
import { getSharedMediaService } from '../sharedMediaService.js';

import AssSubtitleService from './assSubtitleService.js';
import {
  calculateScaleFilter,
  buildFFmpegOutputOptions,
  buildVideoFilters,
  type VideoMetadata,
} from './ffmpegExportUtils.js';
import { ffmpegPool } from './ffmpegPool.js';
import { ffmpeg } from './ffmpegWrapper.js';
import { autoSaveProject } from './projectSavingService.js';
import { calculateFontSizing } from './subtitleSizingService.js';
import { transcribeVideo } from './transcriptionService.js';
import { probeVideoMetadata } from './videoMetadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assService = new AssSubtitleService();

const log = createLogger('auto-processing');

const EXPORTS_DIR = path.join(__dirname, '../../uploads/exports');
const UPLOADS_BASE_DIR = path.resolve(__dirname, '../../uploads');

function validateVideoPath(videoPath: string): void {
  const resolvedPath = path.resolve(videoPath);
  if (!resolvedPath.startsWith(UPLOADS_BASE_DIR + path.sep)) {
    throw new Error('Invalid video path: path must be within uploads directory');
  }
}

interface Stage {
  id: number;
  name: string;
  weight: number;
}

const STAGES: Record<string, Stage> = {
  ANALYZING: { id: 1, name: 'Video wird analysiert...', weight: 5 },
  TRIMMING: { id: 2, name: 'Wird vorbereitet...', weight: 0 },
  SUBTITLES: { id: 3, name: 'Untertitel werden generiert...', weight: 25 },
  FINALIZING: { id: 4, name: 'Wird fertiggestellt...', weight: 70 },
};

interface ProgressData {
  status?: string;
  stage?: number;
  stageName?: string;
  stageProgress?: number;
  overallProgress?: number;
  error?: string | null;
  errorCode?: JobErrorCode | null;
  retryable?: boolean | null;
  errorId?: string | null;
  outputPath?: string | null;
  duration?: number | null;
}

interface TrimPoints {
  trimStart: number;
  trimEnd: number;
  hasTrimming: boolean;
}

interface ProcessingOptions {
  stylePreference?: string;
  heightPreference?: string;
  locale?: Locale;
  maxResolution?: number | null;
  userId?: string;
  originalFilename?: string;
}

interface ProcessingResult {
  outputPath: string;
  duration: number;
  autoProcessToken: string;
  segments: SubtitleSegment[];
  subtitles: string;
  metadata: VideoMetadata;
}

async function updateProgress(uploadId: string, progressData: ProgressData): Promise<void> {
  const data = {
    status: progressData.status || 'processing',
    stage: progressData.stage,
    stageName: progressData.stageName,
    stageProgress: progressData.stageProgress || 0,
    overallProgress: progressData.overallProgress || 0,
    error: progressData.error || null,
    errorCode: progressData.errorCode || null,
    retryable: progressData.retryable ?? null,
    errorId: progressData.errorId || null,
    outputPath: progressData.outputPath || null,
    duration: progressData.duration || null,
  };

  await redisClient.set(`auto:${uploadId}`, JSON.stringify(data), { EX: 60 * 60 });
}

function calculateOverallProgress(stageId: number, stageProgress: number): number {
  const stages = Object.values(STAGES);
  let accumulated = 0;

  for (const stage of stages) {
    if (stage.id < stageId) {
      accumulated += stage.weight;
    } else if (stage.id === stageId) {
      accumulated += (stage.weight * stageProgress) / 100;
      break;
    }
  }

  return Math.min(100, Math.round(accumulated));
}

const TARGET_RESOLUTION = 1080;

async function preScaleVideo(
  inputPath: string,
  metadata: VideoMetadata,
  targetResolution: number
): Promise<string> {
  const isVertical = metadata.width < metadata.height;

  let targetWidth: number, targetHeight: number;
  if (isVertical) {
    targetWidth = targetResolution;
    targetHeight = Math.round(targetWidth * (metadata.height / metadata.width));
  } else {
    targetHeight = targetResolution;
    targetWidth = Math.round(targetHeight * (metadata.width / metadata.height));
  }

  targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

  const tempPath = path.join(path.dirname(inputPath), `prescaled_${Date.now()}.mp4`);

  log.info(
    `Pre-scaling video: ${metadata.width}x${metadata.height} → ${targetWidth}x${targetHeight}`
  );

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(`scale=${targetWidth}:${targetHeight}`)
      .outputOptions([
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-bf',
        '3',
        '-refs',
        '4',
        '-c:a',
        'copy',
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(tempPath);
  });

  return tempPath;
}

async function processVideoAutomatically(
  inputPath: string,
  uploadId: string,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  validateVideoPath(inputPath);
  const autoProcessToken = uuidv4();
  const { stylePreference = 'shadow', heightPreference = 'tief', locale = 'de-DE' } = options;

  log.info(`Starting automatic processing for: ${uploadId}, token: ${autoProcessToken}`);

  let preScaledTempPath: string | null = null;

  try {
    await updateProgress(uploadId, {
      stage: STAGES.ANALYZING.id,
      stageName: STAGES.ANALYZING.name,
      stageProgress: 0,
      overallProgress: 0,
    });

    let metadata = await probeVideoMetadata(inputPath);
    const fileStats = await fs.stat(inputPath);
    log.debug(
      `Video metadata: ${metadata.width}x${metadata.height}, duration: ${metadata.duration}s, size: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB`
    );

    await updateProgress(uploadId, {
      stage: STAGES.ANALYZING.id,
      stageName: STAGES.ANALYZING.name,
      stageProgress: 50,
      overallProgress: calculateOverallProgress(STAGES.ANALYZING.id, 50),
    });

    // No silence detection — subtitles only, no video trimming
    const trimPoints: TrimPoints = {
      trimStart: 0,
      trimEnd: (metadata.duration as number | undefined) ?? 0,
      hasTrimming: false,
    };

    await updateProgress(uploadId, {
      stage: STAGES.ANALYZING.id,
      stageName: STAGES.ANALYZING.name,
      stageProgress: 100,
      overallProgress: calculateOverallProgress(STAGES.ANALYZING.id, 100),
    });

    await updateProgress(uploadId, {
      stage: STAGES.TRIMMING.id,
      stageName: STAGES.TRIMMING.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.TRIMMING.id, 0),
    });

    let workingVideoPath = inputPath;
    const trimmedDuration = trimPoints.trimEnd - trimPoints.trimStart;

    if (trimPoints.hasTrimming) {
      log.info(
        `Trimming video: ${trimPoints.trimStart.toFixed(2)}s to ${trimPoints.trimEnd.toFixed(2)}s`
      );
    }

    await updateProgress(uploadId, {
      stage: STAGES.TRIMMING.id,
      stageName: STAGES.TRIMMING.name,
      stageProgress: 100,
      overallProgress: calculateOverallProgress(STAGES.TRIMMING.id, 100),
    });

    await updateProgress(uploadId, {
      stage: STAGES.SUBTITLES.id,
      stageName: STAGES.SUBTITLES.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.SUBTITLES.id, 0),
    });

    const needsPreScale =
      metadata.width > TARGET_RESOLUTION ||
      (metadata.height > TARGET_RESOLUTION && metadata.width >= metadata.height);

    let subtitles: string;

    try {
      const [transcriptionResult, scaledPath] = await Promise.all([
        // The locale drives both the transcription vocabulary and, further
        // down, the ASS style/font.
        transcribeVideo(inputPath, 'manual', locale),
        needsPreScale
          ? preScaleVideo(inputPath, metadata, TARGET_RESOLUTION)
          : Promise.resolve(null),
      ]);

      subtitles = transcriptionResult;
      log.info(`Transcription complete: ${subtitles.split('\n\n').length} segments`);

      if (scaledPath) {
        workingVideoPath = scaledPath;
        preScaledTempPath = scaledPath;
        const newMetadata = await probeVideoMetadata(workingVideoPath);
        if (newMetadata) {
          metadata = newMetadata;
        }
        log.info(`Pre-scaled video ready: ${metadata.width}x${metadata.height}`);
      }
    } catch (transcriptionError: unknown) {
      const jobError = toJobError(transcriptionError, {
        scope: 'subtitler-auto-processing',
        meta: { uploadId, phase: 'transcription' },
      });
      if (preScaledTempPath) {
        await fs.unlink(preScaledTempPath).catch(() => {});
      }
      await updateProgress(uploadId, {
        status: 'error',
        stage: STAGES.SUBTITLES.id,
        stageName: STAGES.SUBTITLES.name,
        error: jobError.message,
        errorCode: jobError.code,
        retryable: jobError.retryable,
        errorId: jobError.errorId,
      });
      throw transcriptionError;
    }

    await updateProgress(uploadId, {
      stage: STAGES.SUBTITLES.id,
      stageName: STAGES.SUBTITLES.name,
      stageProgress: 100,
      overallProgress: calculateOverallProgress(STAGES.SUBTITLES.id, 100),
    });

    await updateProgress(uploadId, {
      stage: STAGES.FINALIZING.id,
      stageName: STAGES.FINALIZING.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.FINALIZING.id, 0),
    });

    const outputPath = await exportWithEnhancements(
      workingVideoPath,
      subtitles,
      trimPoints,
      metadata,
      fileStats,
      {
        stylePreference,
        heightPreference,
        locale,
        maxResolution: null,
        autoProcessToken,
        uploadId,
      }
    );

    await updateProgress(uploadId, {
      stage: STAGES.FINALIZING.id,
      stageName: STAGES.FINALIZING.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.FINALIZING.id, 0),
    });

    await updateProgress(uploadId, {
      status: 'processing_done',
      stage: STAGES.FINALIZING.id,
      stageName: STAGES.FINALIZING.name,
      stageProgress: 100,
      overallProgress: 100,
      outputPath,
      duration: trimmedDuration,
    });

    log.info(`Automatic processing complete: ${outputPath}`);

    if (preScaledTempPath) {
      await fs.unlink(preScaledTempPath).catch(() => {});
      log.debug(`Cleaned up pre-scaled temp file: ${preScaledTempPath}`);
    }

    const subtitleSegments = parseSubtitlesToSegments(subtitles, trimPoints);

    return {
      outputPath,
      duration: trimmedDuration,
      autoProcessToken,
      segments: subtitleSegments,
      subtitles,
      metadata,
    };
  } catch (error: unknown) {
    const jobError = toJobError(error, {
      scope: 'subtitler-auto-processing',
      meta: { uploadId },
    });

    if (preScaledTempPath) {
      await fs.unlink(preScaledTempPath).catch(() => {});
    }

    await updateProgress(uploadId, {
      status: 'error',
      error: jobError.message,
      errorCode: jobError.code,
      retryable: jobError.retryable,
      errorId: jobError.errorId,
    });

    throw error;
  }
}

interface ExportOptions {
  stylePreference: string;
  heightPreference: string;
  locale: Locale;
  maxResolution: number | null;
  autoProcessToken: string;
  uploadId: string;
}

async function exportWithEnhancements(
  inputPath: string,
  subtitles: string,
  trimPoints: TrimPoints,
  metadata: VideoMetadata,
  fileStats: { size: number },
  options: ExportOptions
): Promise<string> {
  const { stylePreference, heightPreference, locale, maxResolution, autoProcessToken, uploadId } =
    options;

  await fs.mkdir(EXPORTS_DIR, { recursive: true });
  const outputFilename = `auto_${autoProcessToken}_${Date.now()}.mp4`;
  const outputPath = path.join(EXPORTS_DIR, outputFilename);

  const subtitleSegments = parseSubtitlesToSegments(subtitles, trimPoints);
  const { finalFontSize } = calculateFontSizing(metadata, subtitleSegments);

  const styleOptions = {
    fontSize: Math.floor(finalFontSize / 2),
    marginL: 10,
    marginR: 10,
    marginV:
      heightPreference === 'tief'
        ? Math.floor(metadata.height * 0.2)
        : Math.floor(metadata.height * 0.33),
    alignment: 2,
  };

  const trimmedDuration = trimPoints.trimEnd - trimPoints.trimStart;
  const assResult = assService.generateAssContent(
    subtitleSegments,
    { ...metadata, duration: trimmedDuration },
    styleOptions,
    'manual',
    stylePreference,
    locale
  );

  const assFilePath = await assService.createTempAssFile(assResult.content, autoProcessToken);

  const effectiveStyle = assService.mapStyleForLocale(stylePreference, locale);
  const sourceFontPath = assService.getFontPathForStyle(effectiveStyle);
  const fontFilename = path.basename(sourceFontPath);
  const tempFontPath = path.join(path.dirname(assFilePath), fontFilename);

  log.info(
    `[auto-export] locale=${locale} style=${stylePreference} → effectiveStyle=${effectiveStyle} font=${fontFilename}`
  );

  try {
    await fs.copyFile(sourceFontPath, tempFontPath);
  } catch (fontCopyError: unknown) {
    log.warn(
      `Font copy failed: ${fontCopyError instanceof Error ? fontCopyError.message : String(fontCopyError)}`
    );
  }

  const hasAudio = metadata.originalFormat?.audioCodec != null;
  const originalFormatObj = metadata.originalFormat
    ? {
        ...(metadata.originalFormat.codec ? { codec: metadata.originalFormat.codec } : {}),
        ...(metadata.originalFormat.videoBitrate != null
          ? {
              videoBitrate: metadata.originalFormat.videoBitrate,
            }
          : {}),
        ...(metadata.originalFormat.audioCodec
          ? { audioCodec: metadata.originalFormat.audioCodec }
          : {}),
        ...(metadata.originalFormat.audioBitrate != null
          ? {
              audioBitrate: metadata.originalFormat.audioBitrate,
            }
          : {}),
      }
    : undefined;

  const compatibleMetadata: VideoMetadata = {
    width: metadata.width,
    height: metadata.height,
    rotation: metadata.rotation,
    ...(originalFormatObj ? { originalFormat: originalFormatObj } : {}),
  };
  const scaleFilter = calculateScaleFilter(compatibleMetadata, maxResolution);

  const { outputOptions: baseOutputOptions, inputOptions } = buildFFmpegOutputOptions({
    metadata: compatibleMetadata,
    fileStats,
    includeTune: false,
  });

  const videoFilters = buildVideoFilters({
    assFilePath,
    tempFontPath,
    scaleFilter,
  });

  await ffmpegPool.run(async () => {
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(inputPath).setDuration(trimmedDuration);

      if (inputOptions.length > 0) {
        command.inputOptions(inputOptions);
      }

      const outputOptions = [
        ...baseOutputOptions,
        '-ss',
        trimPoints.trimStart.toString(),
        '-t',
        trimmedDuration.toString(),
      ];

      if (!hasAudio) {
        const audioIndex = outputOptions.findIndex((opt) => opt === '-c:a');
        if (audioIndex !== -1) {
          const bitrateIndex = outputOptions.findIndex(
            (opt, i) => i > audioIndex && opt === '-b:a'
          );
          if (bitrateIndex !== -1) {
            outputOptions.splice(bitrateIndex, 2);
          }
          outputOptions.splice(audioIndex, 2, '-an');
        }
      }

      command.outputOptions(outputOptions);

      if (videoFilters.length > 0) {
        command.videoFilters(videoFilters);
      }

      command
        .on('start', () => {
          log.debug('FFmpeg auto export started');
        })
        .on('progress', async (progress: { percent?: number }) => {
          const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
          try {
            await updateProgress(uploadId, {
              stage: STAGES.FINALIZING.id,
              stageName: STAGES.FINALIZING.name,
              stageProgress: progressPercent,
              overallProgress: calculateOverallProgress(STAGES.FINALIZING.id, progressPercent),
            });
          } catch {
            // Ignore progress update errors
          }
        })
        .on('error', (err: Error) => {
          log.error(`FFmpeg auto export error: ${err.message}`);
          reject(err);
        })
        .on('end', () => {
          log.info('FFmpeg auto export completed');
          resolve();
        })
        .save(outputPath);
    });
  }, `auto-export-${autoProcessToken}`);

  try {
    if (assFilePath) await fs.unlink(assFilePath).catch(() => {});
    if (tempFontPath) await fs.unlink(tempFontPath).catch(() => {});
  } catch {
    // Ignore cleanup errors
  }

  return outputPath;
}

function parseSubtitlesToSegments(subtitles: string, trimPoints: TrimPoints): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = subtitles.split('\n\n');

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const timeLine = lines[0];
    const text = lines.slice(1).join('\n');

    const timeMatch = timeLine.match(/(\d+):(\d+\.?\d*)\s*-\s*(\d+):(\d+\.?\d*)/);
    if (!timeMatch) continue;

    const startMin = parseInt(timeMatch[1], 10);
    const startSec = parseFloat(timeMatch[2]);
    const endMin = parseInt(timeMatch[3], 10);
    const endSec = parseFloat(timeMatch[4]);

    let startTime = startMin * 60 + startSec;
    let endTime = endMin * 60 + endSec;

    startTime = startTime - trimPoints.trimStart;
    endTime = endTime - trimPoints.trimStart;

    if (endTime <= 0) continue;
    if (startTime < 0) startTime = 0;

    const trimmedDuration = trimPoints.trimEnd - trimPoints.trimStart;
    if (startTime >= trimmedDuration) continue;
    if (endTime > trimmedDuration) endTime = trimmedDuration;

    segments.push({
      startTime,
      endTime,
      text,
    });
  }

  return segments;
}

/**
 * Local auto-progress alias of the contract type so existing callers and
 * re-exports keep their import path. New code should import `AutoProgress`
 * directly from `@gruenerator/contracts`.
 */
type AutoProgressData = AutoProgress;

async function getAutoProgress(token: string): Promise<AutoProgressData | null> {
  const data = await redisClient.get(`auto:${token}`);
  if (!data || typeof data !== 'string') return null;
  const { parseAutoProgress } = await import('./redisCodecs.js');
  return parseAutoProgress(data, `auto:${token}`);
}

interface StartAutoProcessingOptions {
  uploadId: string;
  videoPath: string;
  originalFilename: string;
  userId?: string | null;
  locale?: Locale;
  maxResolution?: number | null;
  /**
   * Called after the result was auto-saved as a project, before the Redis
   * 'complete' status is written (so the caller's bookkeeping exists by the
   * time pollers see completion). Best-effort — errors are logged, not fatal.
   */
  onProjectSaved?: (projectId: string) => Promise<void>;
}

/**
 * Kicks off the full auto-processing pipeline in the background and tracks
 * progress under the Redis key `auto:${uploadId}` (consumed by GET
 * /subtitler/auto-progress/:uploadId). With a `userId`, the finished result
 * is auto-saved as a subtitler project (and a share link is created), so the
 * reel shows up on the user's reel page.
 *
 * Extracted from POST /process-auto so the chat reel branch can start the
 * same pipeline for videos attached in the chat composer. Resolves once the
 * initial progress key is written; the pipeline itself runs detached.
 */
async function startAutoProcessing(options: StartAutoProcessingOptions): Promise<void> {
  const {
    uploadId,
    videoPath,
    originalFilename,
    userId = null,
    locale = 'de-DE',
    maxResolution = null,
    onProjectSaved,
  } = options;

  await redisClient.set(
    `auto:${uploadId}`,
    JSON.stringify({ status: 'processing', stage: 1, stageProgress: 0, overallProgress: 0 }),
    { EX: 3600 }
  );

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
        } catch (saveErr: unknown) {
          log.warn(
            `Auto-save project failed for ${uploadId}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`
          );
        }

        if (savedProjectId && onProjectSaved) {
          try {
            await onProjectSaved(savedProjectId);
          } catch (hookErr: unknown) {
            log.warn(
              `onProjectSaved hook failed for ${uploadId}: ${hookErr instanceof Error ? hookErr.message : String(hookErr)}`
            );
          }
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
}

export { processVideoAutomatically, startAutoProcessing, getAutoProgress, STAGES };
export type {
  ProcessingOptions,
  ProcessingResult,
  VideoMetadata,
  SubtitleSegment,
  AutoProgressData,
};
