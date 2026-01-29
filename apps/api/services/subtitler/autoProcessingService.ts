/**
 * Auto Processing Service
 *
 * Automatically processes videos: analyzes, trims silence, generates subtitles, and exports.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { v4 as uuidv4 } from 'uuid';

import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import AssSubtitleService from './assSubtitleService.js';
import {
  calculateScaleFilter,
  buildFFmpegOutputOptions,
  buildVideoFilters,
} from './ffmpegExportUtils.js';
import { ffmpegPool } from './ffmpegPool.js';
import { ffmpeg, ffprobe, FFprobeMetadata } from './ffmpegWrapper.js';
import * as hwaccel from './hwaccelUtils.js';
import { detectSilence, calculateTrimPoints, type SilenceData } from './silenceDetectionService.js';
import { transcribeVideo } from './transcriptionService.js';

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
  ANALYZING: { id: 1, name: 'Video wird analysiert...', weight: 15 },
  TRIMMING: { id: 2, name: 'Stille Teile werden entfernt...', weight: 20 },
  SUBTITLES: { id: 3, name: 'Untertitel werden generiert...', weight: 55 },
  FINALIZING: { id: 4, name: 'Wird fertiggestellt...', weight: 10 },
};

interface ProgressData {
  status?: string;
  stage?: number;
  stageName?: string;
  stageProgress?: number;
  overallProgress?: number;
  error?: string | null;
  outputPath?: string | null;
  duration?: number | null;
}

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  fps: number;
  rotation: string;
  originalFormat: {
    codec?: string;
    audioCodec?: string;
    audioBitrate: number | null;
    videoBitrate?: number | null;
  };
}

interface TrimPoints {
  trimStart: number;
  trimEnd: number;
  hasTrimming: boolean;
}

interface ProcessingOptions {
  stylePreference?: string;
  heightPreference?: string;
  locale?: string;
  maxResolution?: number | null;
  userId?: string;
  originalFilename?: string;
}

interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
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

function parseFrameRate(frameRateStr: string): number {
  if (!frameRateStr) return 30;
  const parts = frameRateStr.split('/');
  if (parts.length === 2) {
    const numerator = parseFloat(parts[0]);
    const denominator = parseFloat(parts[1]);
    if (denominator !== 0) {
      return numerator / denominator;
    }
  }
  const parsed = parseFloat(frameRateStr);
  return isNaN(parsed) ? 30 : parsed;
}

async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  const metadata = await ffprobe(inputPath);
  const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
  const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

  return {
    width: videoStream?.width || 1920,
    height: videoStream?.height || 1080,
    duration: parseFloat(metadata.format.duration || '0') || 0,
    fps: parseFrameRate(videoStream?.r_frame_rate || '30/1'),
    rotation: videoStream?.rotation || '0',
    originalFormat: {
      codec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 : null,
    },
  };
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
      .on('end', resolve)
      .on('error', reject)
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
  const {
    stylePreference = 'shadow',
    heightPreference = 'tief',
    locale = 'de-DE',
    maxResolution = null,
  } = options;

  log.info(`Starting automatic processing for: ${uploadId}, token: ${autoProcessToken}`);

  let preScaledTempPath: string | null = null;

  try {
    await updateProgress(uploadId, {
      stage: STAGES.ANALYZING.id,
      stageName: STAGES.ANALYZING.name,
      stageProgress: 0,
      overallProgress: 0,
    });

    let metadata = await getVideoMetadata(inputPath);
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

    let silenceData: SilenceData | undefined;
    let trimPoints: TrimPoints = { trimStart: 0, trimEnd: metadata.duration, hasTrimming: false };

    try {
      silenceData = await detectSilence(inputPath);
      trimPoints = calculateTrimPoints(silenceData);
    } catch (silenceError: any) {
      log.warn(`Silence detection failed: ${silenceError.message} - using full video`);
    }

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
        transcribeVideo(inputPath, 'manual', undefined, 'de'),
        needsPreScale
          ? preScaleVideo(inputPath, metadata, TARGET_RESOLUTION)
          : Promise.resolve(null),
      ]);

      subtitles = transcriptionResult;
      log.info(`Transcription complete: ${subtitles.split('\n\n').length} segments`);

      if (scaledPath) {
        workingVideoPath = scaledPath;
        preScaledTempPath = scaledPath;
        const newMetadata = await getVideoMetadata(workingVideoPath);
        if (newMetadata) {
          metadata = newMetadata;
        }
        log.info(`Pre-scaled video ready: ${metadata.width}x${metadata.height}`);
      }
    } catch (transcriptionError: any) {
      log.error(`Transcription/scaling failed: ${transcriptionError.message}`);
      if (preScaledTempPath) {
        await fs.unlink(preScaledTempPath).catch(() => {});
      }
      await updateProgress(uploadId, {
        status: 'error',
        stage: STAGES.SUBTITLES.id,
        stageName: STAGES.SUBTITLES.name,
        error: 'Untertitel konnten nicht generiert werden. Bitte versuche es erneut.',
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
  } catch (error: any) {
    log.error(`Automatic processing failed: ${error.message}`);

    if (preScaledTempPath) {
      await fs.unlink(preScaledTempPath).catch(() => {});
    }

    await updateProgress(uploadId, {
      status: 'error',
      error: error.message || 'Verarbeitung fehlgeschlagen',
    });

    throw error;
  }
}

interface ExportOptions {
  stylePreference: string;
  heightPreference: string;
  locale: string;
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

  const styleOptions = {
    fontSize: calculateFontSize(metadata),
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

  try {
    await fs.copyFile(sourceFontPath, tempFontPath);
  } catch (fontCopyError: any) {
    log.warn(`Font copy failed: ${fontCopyError.message}`);
  }

  const useHwAccel = await hwaccel.detectVaapi();
  const hasAudio = metadata.originalFormat?.audioCodec != null;
  const compatibleMetadata = {
    width: metadata.width,
    height: metadata.height,
    rotation: metadata.rotation,
    originalFormat: metadata.originalFormat
      ? {
          codec: metadata.originalFormat.codec,
          videoBitrate: metadata.originalFormat.videoBitrate ?? undefined,
          audioCodec: metadata.originalFormat.audioCodec,
          audioBitrate: metadata.originalFormat.audioBitrate ?? undefined,
        }
      : undefined,
  };
  const scaleFilter = calculateScaleFilter(compatibleMetadata, maxResolution);

  const { outputOptions: baseOutputOptions, inputOptions } = buildFFmpegOutputOptions({
    metadata: compatibleMetadata,
    fileStats,
    useHwAccel,
    includeTune: false,
  });

  const videoFilters = buildVideoFilters({
    assFilePath,
    tempFontPath,
    scaleFilter,
    useHwAccel,
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

function calculateFontSize(metadata: VideoMetadata): number {
  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;

  let basePercentage: number;
  if (referenceDimension >= 2160) {
    basePercentage = isVertical ? 0.035 : 0.0325;
  } else if (referenceDimension >= 1080) {
    basePercentage = isVertical ? 0.027 : 0.025;
  } else {
    basePercentage = isVertical ? 0.033 : 0.03;
  }

  return Math.floor(referenceDimension * basePercentage);
}

interface AutoProgressData {
  status: string;
  stage?: number;
  stageName?: string;
  stageProgress?: number;
  overallProgress?: number;
  error?: string | null;
  outputPath?: string | null;
  duration?: number | null;
}

async function getAutoProgress(token: string): Promise<AutoProgressData | null> {
  const data = await redisClient.get(`auto:${token}`);
  if (!data || typeof data !== 'string') return null;
  return JSON.parse(data);
}

export { processVideoAutomatically, getAutoProgress, STAGES };
export type {
  ProcessingOptions,
  ProcessingResult,
  VideoMetadata,
  SubtitleSegment,
  AutoProgressData,
};
