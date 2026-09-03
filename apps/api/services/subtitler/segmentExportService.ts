/**
 * Segment Export Service
 *
 * Exports videos with segment cuts (single-clip operations).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { type SubtitleSegment } from '@gruenerator/contracts';
import { toJobErrorStatus } from '@gruenerator/contracts';
import { v4 as uuidv4 } from 'uuid';

import { type VideoMetadata } from '../../routes/subtitler/types.js';
import { toJobError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import { ffmpegPool } from './ffmpegPool.js';
import { ffmpeg } from './ffmpegWrapper.js';
import * as hwaccel from './hwaccelUtils.js';
import {
  buildSegmentFilterComplex,
  buildVideoOnlyFilterComplex,
  calculateTotalDuration,
  type Segment,
} from './segmentFilterBuilders.js';
import { calculateFontSizing } from './subtitleSizingService.js';
import { probeVideoMetadata } from './videoMetadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('segment-export');

const EXPORTS_DIR = path.join(__dirname, '../../uploads/exports');

interface SubtitleConfig {
  segments: SubtitleSegment[];
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
  locale?: string | undefined;
}

interface ExportOptions {
  projectId?: string;
  includeSubtitles?: boolean;
  subtitleOptions?: SubtitleConfig;
}

interface ExportResult {
  exportToken: string;
  outputPath: string;
  duration: number;
  segmentCount: number;
}

/**
 * Adjust subtitle timings based on video segments
 * Maps original subtitle times to new composed video times
 */
export function adjustSubtitleTimings(
  originalSubtitles: SubtitleSegment[],
  segments: Segment[]
): SubtitleSegment[] {
  const adjustedSubtitles: SubtitleSegment[] = [];

  for (const subtitle of originalSubtitles) {
    let composedStartTime: number | null = null;
    let composedEndTime: number | null = null;
    let accumulatedTime = 0;

    for (const segment of segments) {
      const segmentDuration = segment.end - segment.start;

      if (subtitle.startTime >= segment.start && subtitle.startTime < segment.end) {
        composedStartTime = accumulatedTime + (subtitle.startTime - segment.start);
      }

      if (subtitle.endTime > segment.start && subtitle.endTime <= segment.end) {
        composedEndTime = accumulatedTime + (subtitle.endTime - segment.start);
      }

      if (subtitle.startTime < segment.start && subtitle.endTime > segment.end) {
        if (composedStartTime === null) {
          composedStartTime = accumulatedTime;
        }
        composedEndTime = accumulatedTime + segmentDuration;
      }

      accumulatedTime += segmentDuration;
    }

    if (
      composedStartTime !== null &&
      composedEndTime !== null &&
      composedEndTime > composedStartTime
    ) {
      adjustedSubtitles.push({
        ...subtitle,
        startTime: composedStartTime,
        endTime: composedEndTime,
      });
    }
  }

  return adjustedSubtitles;
}

/**
 * Export video with segment cuts
 */
export async function exportWithSegments(
  inputPath: string,
  segments: Segment[],
  options: ExportOptions = {}
): Promise<ExportResult> {
  const exportToken = uuidv4();
  const { projectId } = options;

  log.info(`Starting segment export, token: ${exportToken}, segments: ${segments.length}`);

  try {
    await fs.access(inputPath);

    const metadata = await probeVideoMetadata(inputPath);
    const fileStats = await fs.stat(inputPath);

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    const validSegments = segments.filter(
      (seg) =>
        seg.start >= 0 &&
        seg.end > seg.start &&
        seg.end <= ((metadata.duration as number | undefined) ?? 0) + 0.5
    );

    if (validSegments.length === 0) {
      throw new Error('No valid segments found');
    }

    await fs.mkdir(EXPORTS_DIR, { recursive: true });
    const outputFilename = projectId
      ? `cut_${projectId}_${Date.now()}.mp4`
      : `cut_${exportToken}_${Date.now()}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputFilename);

    const totalDuration = calculateTotalDuration(validSegments);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'exporting',
        progress: 0,
        message: 'Starting video processing...',
        type: 'segment-cut',
      }),
      { EX: 60 * 60 }
    );

    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const fileSizeMB = fileStats.size / 1024 / 1024;

    const hasAudio = metadata.originalFormat?.audioCodec != null;

    await ffmpegPool.run(async () => {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(inputPath).setDuration(totalDuration);

        const isLargeFile = fileSizeMB > 200;
        const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
        const { crf, preset } = qualitySettings;

        const is4K = referenceDimension >= 2160;
        const isHevcSource = metadata.originalFormat?.codec === 'hevc';

        const { filterComplex, outputStreams } = hasAudio
          ? buildSegmentFilterComplex(validSegments)
          : buildVideoOnlyFilterComplex(validSegments);

        const videoCodec = is4K && isHevcSource ? 'libx265' : 'libx264';

        const outputOptions = [
          '-y',
          '-filter_complex',
          filterComplex,
          '-map',
          outputStreams[0],
          ...(hasAudio ? ['-map', outputStreams[1]] : []),
          '-c:v',
          videoCodec,
          '-preset',
          preset,
          '-crf',
          crf.toString(),
          '-profile:v',
          videoCodec === 'libx264' ? 'high' : 'main',
          '-level',
          videoCodec === 'libx264' ? '4.1' : '4.0',
          ...hwaccel.getCpuPixelFormatOptions(),
          ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
          '-movflags',
          '+faststart',
          '-avoid_negative_ts',
          'make_zero',
        ];

        if (videoCodec === 'libx264') {
          outputOptions.push(...hwaccel.getX264QualityParams());
        }

        log.debug(`Segment export using CPU: ${referenceDimension}p, CRF: ${crf}`);

        command.outputOptions(outputOptions);

        command
          .on('start', () => {
            log.debug('FFmpeg segment export started');
          })
          .on('progress', async (progress: unknown) => {
            const prog = progress as { percent?: number };
            const progressPercent = prog.percent ? Math.round(prog.percent) : 0;
            try {
              await redisClient.set(
                `export:${exportToken}`,
                JSON.stringify({
                  status: 'exporting',
                  progress: progressPercent,
                  message: `Processing: ${progressPercent}%`,
                  type: 'segment-cut',
                }),
                { EX: 60 * 60 }
              );
            } catch {
              /* ignore progress update error */
            }
          })
          .on('error', (err: unknown) => {
            const error = err as Error;
            log.error(`FFmpeg segment export error: ${error.message}`);
            reject(err);
          })
          .on('end', () => {
            log.info('FFmpeg segment export completed');
            resolve();
          })
          .save(outputPath);
      });
    }, `segment-export-${exportToken}`);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'complete',
        progress: 100,
        outputPath,
        duration: totalDuration,
        type: 'segment-cut',
      }),
      { EX: 60 * 60 }
    );

    log.info(`Segment export completed: ${outputPath}, duration: ${totalDuration}s`);

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length,
    };
  } catch (error: unknown) {
    const jobError = toJobError(error, {
      scope: 'subtitler-segment-export',
      meta: { exportToken, type: 'segment-cut' },
    });

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({ ...toJobErrorStatus(jobError), type: 'segment-cut' }),
      { EX: 60 * 60 }
    );

    throw error;
  }
}

/**
 * Export video with segments AND subtitles
 */
export async function exportWithSegmentsAndSubtitles(
  inputPath: string,
  segments: Segment[],
  subtitleConfig: SubtitleConfig,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const exportToken = uuidv4();
  const { projectId } = options;

  log.info(`Starting segment+subtitle export, token: ${exportToken}`);

  try {
    await fs.access(inputPath);

    const metadata = await probeVideoMetadata(inputPath);
    const fileStats = await fs.stat(inputPath);

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    const validSegments = segments.filter(
      (seg) =>
        seg.start >= 0 &&
        seg.end > seg.start &&
        seg.end <= ((metadata.duration as number | undefined) ?? 0) + 0.5
    );

    if (validSegments.length === 0) {
      throw new Error('No valid segments found');
    }

    await fs.mkdir(EXPORTS_DIR, { recursive: true });
    const outputFilename = projectId
      ? `cut_subtitled_${projectId}_${Date.now()}.mp4`
      : `cut_subtitled_${exportToken}_${Date.now()}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputFilename);

    const totalDuration = calculateTotalDuration(validSegments);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'exporting',
        progress: 0,
        message: 'Starting video processing with subtitles...',
        type: 'segment-cut-subtitles',
      }),
      { EX: 60 * 60 }
    );

    const AssSubtitleService = (await import('./assSubtitleService.js')).default;
    const assService = new AssSubtitleService();

    const adjustedSubtitles = adjustSubtitleTimings(subtitleConfig.segments, validSegments);

    const isVertical = metadata.width < metadata.height;
    const { finalFontSize } = calculateFontSizing(metadata, adjustedSubtitles);
    const styleOptions = {
      fontSize: Math.floor(finalFontSize / 2),
      marginL: 10,
      marginR: 10,
      marginV:
        subtitleConfig.heightPreference === 'tief'
          ? Math.floor(metadata.height * 0.2)
          : Math.floor(metadata.height * 0.33),
      alignment: 2,
    };

    const assResult = assService.generateAssContent(
      adjustedSubtitles,
      { ...metadata, duration: totalDuration },
      styleOptions,
      'manual',
      subtitleConfig.stylePreference || 'standard',
      subtitleConfig.locale || 'de-DE'
    );

    const assFilePath = await assService.createTempAssFile(assResult.content, exportToken);

    const effectiveStyle = assService.mapStyleForLocale(
      subtitleConfig.stylePreference || 'standard',
      subtitleConfig.locale || 'de-DE'
    );
    const sourceFontPath = assService.getFontPathForStyle(effectiveStyle);
    const fontFilename = path.basename(sourceFontPath);
    const tempFontPath = path.join(path.dirname(assFilePath), fontFilename);

    try {
      await fs.copyFile(sourceFontPath, tempFontPath);
    } catch (fontCopyError: unknown) {
      log.warn(
        `Font copy failed: ${fontCopyError instanceof Error ? fontCopyError.message : String(fontCopyError)}`
      );
    }

    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const fileSizeMB = fileStats.size / 1024 / 1024;
    const hasAudio = metadata.originalFormat?.audioCodec != null;

    await ffmpegPool.run(async () => {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(inputPath).setDuration(totalDuration);

        const isLargeFile = fileSizeMB > 200;
        const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
        const { crf, preset } = qualitySettings;

        const is4K = referenceDimension >= 2160;
        const isHevcSource = metadata.originalFormat?.codec === 'hevc';

        const { filterComplex: segmentFilter } = hasAudio
          ? buildSegmentFilterComplex(validSegments)
          : buildVideoOnlyFilterComplex(validSegments);

        const fontDir = path.dirname(tempFontPath || assFilePath);
        const subtitleFilter = `subtitles=${assFilePath}:fontsdir=${fontDir}`;

        const combinedFilter = `${segmentFilter};[outv]${subtitleFilter}[finalv]`;

        const videoCodec = is4K && isHevcSource ? 'libx265' : 'libx264';

        const outputOptions = [
          '-y',
          '-filter_complex',
          combinedFilter,
          '-map',
          '[finalv]',
          ...(hasAudio ? ['-map', '[outa]'] : []),
          '-c:v',
          videoCodec,
          '-preset',
          preset,
          '-crf',
          crf.toString(),
          '-profile:v',
          videoCodec === 'libx264' ? 'high' : 'main',
          '-level',
          videoCodec === 'libx264' ? '4.1' : '4.0',
          ...hwaccel.getCpuPixelFormatOptions(),
          ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
          '-movflags',
          '+faststart',
          '-avoid_negative_ts',
          'make_zero',
        ];

        if (videoCodec === 'libx264') {
          outputOptions.push(...hwaccel.getX264QualityParams());
        }

        command.outputOptions(outputOptions);

        command
          .on('start', () => {
            log.debug('FFmpeg segment+subtitle export started');
          })
          .on('progress', async (progress: unknown) => {
            const prog = progress as { percent?: number };
            const progressPercent = prog.percent ? Math.round(prog.percent) : 0;
            try {
              await redisClient.set(
                `export:${exportToken}`,
                JSON.stringify({
                  status: 'exporting',
                  progress: progressPercent,
                  message: `Processing: ${progressPercent}%`,
                  type: 'segment-cut-subtitles',
                }),
                { EX: 60 * 60 }
              );
            } catch {
              /* ignore progress update error */
            }
          })
          .on('error', (err: unknown) => {
            const error = err as Error;
            log.error(`FFmpeg error: ${error.message}`);
            reject(err);
          })
          .on('end', () => {
            log.info('FFmpeg segment+subtitle export completed');
            resolve();
          })
          .save(outputPath);
      });
    }, `segment-subtitle-export-${exportToken}`);

    try {
      if (assFilePath) await fs.unlink(assFilePath).catch(() => {});
      if (tempFontPath) await fs.unlink(tempFontPath).catch(() => {});
    } catch {
      /* ignore temp file cleanup error */
    }

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'complete',
        progress: 100,
        outputPath,
        duration: totalDuration,
        type: 'segment-cut-subtitles',
      }),
      { EX: 60 * 60 }
    );

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length,
    };
  } catch (error: unknown) {
    const jobError = toJobError(error, {
      scope: 'subtitler-segment-export',
      meta: { exportToken, type: 'segment-cut-subtitles' },
    });

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({ ...toJobErrorStatus(jobError), type: 'segment-cut-subtitles' }),
      { EX: 60 * 60 }
    );

    throw error;
  }
}

export { calculateTotalDuration } from './segmentFilterBuilders.js';
export type { VideoMetadata, SubtitleSegment, SubtitleConfig, ExportOptions, ExportResult };
