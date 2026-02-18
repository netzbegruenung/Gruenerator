/**
 * Multi-Clip Export Service
 *
 * Exports videos with segment cuts from multiple input clips.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { v4 as uuidv4 } from 'uuid';

import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import { ffmpegPool } from './ffmpegPool.js';
import { ffmpeg, ffprobe } from './ffmpegWrapper.js';
import * as hwaccel from './hwaccelUtils.js';
import {
  buildMultiClipFilterComplex,
  buildMultiClipVideoOnlyFilterComplex,
  calculateTotalDuration,
  type Segment,
  type Clip,
} from './segmentFilterBuilders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('multiclip-export');

const EXPORTS_DIR = path.join(__dirname, '../../uploads/exports');

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
    videoBitrate: number | null;
  };
}

interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
}

interface SubtitleConfig {
  segments: SubtitleSegment[];
  stylePreference?: string;
  heightPreference?: string;
  locale?: string;
}

interface ExportOptions {
  projectId?: string;
}

interface MultiClipExportResult {
  exportToken: string;
  outputPath: string;
  duration: number;
  segmentCount: number;
  clipCount: number;
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
      videoBitrate: videoStream?.bit_rate ? parseInt(videoStream.bit_rate) : null,
    },
  };
}

function calculateFontSize(metadata: VideoMetadata): number {
  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;

  let minFontSize: number, maxFontSize: number, basePercentage: number;

  if (referenceDimension >= 2160) {
    minFontSize = 80;
    maxFontSize = 180;
    basePercentage = isVertical ? 0.07 : 0.065;
  } else if (referenceDimension >= 1440) {
    minFontSize = 60;
    maxFontSize = 140;
    basePercentage = isVertical ? 0.065 : 0.06;
  } else if (referenceDimension >= 1080) {
    minFontSize = 40;
    maxFontSize = 90;
    basePercentage = isVertical ? 0.054 : 0.0495;
  } else if (referenceDimension >= 720) {
    minFontSize = 35;
    maxFontSize = 70;
    basePercentage = isVertical ? 0.055 : 0.05;
  } else {
    minFontSize = 32;
    maxFontSize = 65;
    basePercentage = isVertical ? 0.065 : 0.06;
  }

  const totalPixels = metadata.width * metadata.height;
  const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1;
  const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4);

  return Math.max(
    minFontSize,
    Math.min(maxFontSize, Math.floor(referenceDimension * adjustedPercentage))
  );
}

/**
 * Adjust subtitle timings for multi-clip segments
 */
function adjustSubtitleTimingsMultiClip(
  originalSubtitles: SubtitleSegment[],
  segments: Segment[],
  _clipMetadataMap: Record<string, VideoMetadata>
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
 * Export multi-clip video with segment cuts
 */
export async function exportMultiClipWithSegments(
  clips: Clip[],
  segments: Segment[],
  options: ExportOptions = {}
): Promise<MultiClipExportResult> {
  const exportToken = uuidv4();
  const { projectId } = options;

  log.info(
    `Starting multi-clip export, token: ${exportToken}, clips: ${clips.length}, segments: ${segments.length}`
  );

  try {
    for (const clip of clips) {
      await fs.access(clip.inputPath);
    }

    const firstClipMetadata = await getVideoMetadata(clips[0].inputPath);

    const clipMetadataMap: Record<string, VideoMetadata> = {};
    for (const clip of clips) {
      clipMetadataMap[clip.clipId] = await getVideoMetadata(clip.inputPath);
    }

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    const validSegments = segments.filter((seg) => {
      const clipMeta = seg.clipId ? clipMetadataMap[seg.clipId] : undefined;
      if (!clipMeta) {
        log.warn(`Segment references unknown clipId: ${seg.clipId}`);
        return false;
      }
      return seg.start >= 0 && seg.end > seg.start && seg.end <= clipMeta.duration + 0.5;
    });

    if (validSegments.length === 0) {
      throw new Error('No valid segments found');
    }

    await fs.mkdir(EXPORTS_DIR, { recursive: true });
    const outputFilename = projectId
      ? `multiclip_${projectId}_${Date.now()}.mp4`
      : `multiclip_${exportToken}_${Date.now()}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputFilename);

    const totalDuration = calculateTotalDuration(validSegments);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'exporting',
        progress: 0,
        message: 'Starting multi-clip video processing...',
        type: 'multi-clip-cut',
      }),
      { EX: 60 * 60 }
    );

    const isVertical = firstClipMetadata.width < firstClipMetadata.height;
    const referenceDimension = isVertical ? firstClipMetadata.width : firstClipMetadata.height;
    const useHwAccel = await hwaccel.detectVaapi();

    const hasAudio = clips.some(
      (clip) => clipMetadataMap[clip.clipId]?.originalFormat?.audioCodec != null
    );

    await ffmpegPool.run(async () => {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg();

        for (const clip of clips) {
          command.input(clip.inputPath);
        }

        command.setDuration(totalDuration);

        const qualitySettings = hwaccel.getQualitySettings(referenceDimension, false);
        const { crf, preset } = qualitySettings;

        const { filterComplex, outputStreams } = hasAudio
          ? buildMultiClipFilterComplex(clips, validSegments)
          : buildMultiClipVideoOnlyFilterComplex(clips, validSegments);

        let outputOptions: string[];

        if (useHwAccel) {
          const is4K = referenceDimension >= 2160;
          const isHevcSource = firstClipMetadata.originalFormat?.codec === 'hevc';
          const videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
          const qp = hwaccel.crfToQp(crf);

          command.inputOptions(hwaccel.getVaapiInputOptions());

          outputOptions = [
            '-y',
            '-filter_complex',
            filterComplex,
            '-map',
            outputStreams[0],
            ...(hasAudio && outputStreams[1] ? ['-map', outputStreams[1]] : []),
            ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags',
            '+faststart',
            '-avoid_negative_ts',
            'make_zero',
          ];

          log.debug(`Multi-clip export using VAAPI: ${clips.length} clips, encoder: ${videoCodec}`);
        } else {
          const is4K = referenceDimension >= 2160;
          const isHevcSource = firstClipMetadata.originalFormat?.codec === 'hevc';
          const videoCodec = is4K && isHevcSource ? 'libx265' : 'libx264';

          outputOptions = [
            '-y',
            '-filter_complex',
            filterComplex,
            '-map',
            outputStreams[0],
            ...(hasAudio && outputStreams[1] ? ['-map', outputStreams[1]] : []),
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
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags',
            '+faststart',
            '-avoid_negative_ts',
            'make_zero',
          ];

          if (videoCodec === 'libx264') {
            outputOptions.push(...hwaccel.getX264QualityParams());
          }

          log.debug(`Multi-clip export using CPU: ${clips.length} clips, CRF: ${crf}`);
        }

        command.outputOptions(outputOptions);

        command
          .on('start', () => {
            log.debug('FFmpeg multi-clip export started');
          })
          .on('progress', async (progress: { percent?: number }) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
            try {
              await redisClient.set(
                `export:${exportToken}`,
                JSON.stringify({
                  status: 'exporting',
                  progress: progressPercent,
                  message: `Processing: ${progressPercent}%`,
                  type: 'multi-clip-cut',
                }),
                { EX: 60 * 60 }
              );
            } catch {
              /* ignore progress update error */
            }
          })
          .on('error', (err: Error) => {
            log.error(`FFmpeg multi-clip export error: ${err.message}`);
            reject(err);
          })
          .on('end', () => {
            log.info('FFmpeg multi-clip export completed');
            resolve();
          })
          .save(outputPath);
      });
    }, `multiclip-export-${exportToken}`);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'complete',
        progress: 100,
        outputPath,
        duration: totalDuration,
        type: 'multi-clip-cut',
      }),
      { EX: 60 * 60 }
    );

    log.info(`Multi-clip export completed: ${outputPath}, duration: ${totalDuration}s`);

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length,
      clipCount: clips.length,
    };
  } catch (error: any) {
    log.error(`Multi-clip export failed: ${error.message}`);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'error',
        error: error.message,
        type: 'multi-clip-cut',
      }),
      { EX: 60 * 60 }
    );

    throw error;
  }
}

/**
 * Export multi-clip video with segments AND subtitles
 */
export async function exportMultiClipWithSegmentsAndSubtitles(
  clips: Clip[],
  segments: Segment[],
  subtitleConfig: SubtitleConfig,
  options: ExportOptions = {}
): Promise<MultiClipExportResult> {
  const exportToken = uuidv4();
  const { projectId } = options;

  log.info(`Starting multi-clip+subtitle export, token: ${exportToken}`);

  try {
    for (const clip of clips) {
      await fs.access(clip.inputPath);
    }

    const firstClipMetadata = await getVideoMetadata(clips[0].inputPath);
    const fileStats = await fs.stat(clips[0].inputPath);

    const clipMetadataMap: Record<string, VideoMetadata> = {};
    for (const clip of clips) {
      clipMetadataMap[clip.clipId] = await getVideoMetadata(clip.inputPath);
    }

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    const validSegments = segments.filter((seg) => {
      const clipMeta = seg.clipId ? clipMetadataMap[seg.clipId] : undefined;
      if (!clipMeta) return false;
      return seg.start >= 0 && seg.end > seg.start && seg.end <= clipMeta.duration + 0.5;
    });

    if (validSegments.length === 0) {
      throw new Error('No valid segments found');
    }

    await fs.mkdir(EXPORTS_DIR, { recursive: true });
    const outputFilename = projectId
      ? `multiclip_subtitled_${projectId}_${Date.now()}.mp4`
      : `multiclip_subtitled_${exportToken}_${Date.now()}.mp4`;
    const outputPath = path.join(EXPORTS_DIR, outputFilename);

    const totalDuration = calculateTotalDuration(validSegments);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'exporting',
        progress: 0,
        message: 'Starting multi-clip video processing with subtitles...',
        type: 'multi-clip-cut-subtitles',
      }),
      { EX: 60 * 60 }
    );

    const AssSubtitleService = (await import('./assSubtitleService.js')).default;
    const assService = new AssSubtitleService();

    const adjustedSubtitles = adjustSubtitleTimingsMultiClip(
      subtitleConfig.segments,
      validSegments,
      clipMetadataMap
    );

    const isVertical = firstClipMetadata.width < firstClipMetadata.height;
    const styleOptions = {
      fontSize: Math.floor(calculateFontSize(firstClipMetadata) / 2),
      marginL: 10,
      marginR: 10,
      marginV:
        subtitleConfig.heightPreference === 'tief'
          ? Math.floor(firstClipMetadata.height * 0.2)
          : Math.floor(firstClipMetadata.height * 0.33),
      alignment: 2,
    };

    const assResult = assService.generateAssContent(
      adjustedSubtitles,
      { ...firstClipMetadata, duration: totalDuration },
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
    } catch (fontCopyError: any) {
      log.warn(`Font copy failed: ${fontCopyError.message}`);
    }

    const referenceDimension = isVertical ? firstClipMetadata.width : firstClipMetadata.height;
    const fileSizeMB = fileStats.size / 1024 / 1024;
    const useHwAccel = await hwaccel.detectVaapi();
    const hasAudio = clips.some(
      (clip) => clipMetadataMap[clip.clipId]?.originalFormat?.audioCodec != null
    );

    await ffmpegPool.run(async () => {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg();

        for (const clip of clips) {
          command.input(clip.inputPath);
        }

        command.setDuration(totalDuration);

        const isLargeFile = fileSizeMB > 200;
        const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
        const { crf, preset } = qualitySettings;

        const is4K = referenceDimension >= 2160;
        const isHevcSource = firstClipMetadata.originalFormat?.codec === 'hevc';

        const { filterComplex: segmentFilter } = hasAudio
          ? buildMultiClipFilterComplex(clips, validSegments)
          : buildMultiClipVideoOnlyFilterComplex(clips, validSegments);

        const fontDir = path.dirname(tempFontPath || assFilePath);
        const subtitleFilter = `subtitles=${assFilePath}:fontsdir=${fontDir}`;

        const combinedFilter = `${segmentFilter};[outv]${subtitleFilter}[finalv]`;

        let outputOptions: string[];

        if (useHwAccel) {
          const videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
          const qp = hwaccel.crfToQp(crf);

          command.inputOptions(hwaccel.getVaapiInputOptions());

          outputOptions = [
            '-y',
            '-filter_complex',
            combinedFilter,
            '-map',
            '[finalv]',
            ...(hasAudio ? ['-map', '[outa]'] : []),
            ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags',
            '+faststart',
            '-avoid_negative_ts',
            'make_zero',
          ];
        } else {
          const videoCodec = is4K && isHevcSource ? 'libx265' : 'libx264';

          outputOptions = [
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
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags',
            '+faststart',
            '-avoid_negative_ts',
            'make_zero',
          ];

          if (videoCodec === 'libx264') {
            outputOptions.push(...hwaccel.getX264QualityParams());
          }
        }

        command.outputOptions(outputOptions);

        command
          .on('start', () => {
            log.debug('FFmpeg multi-clip+subtitle export started');
          })
          .on('progress', async (progress: { percent?: number }) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
            try {
              await redisClient.set(
                `export:${exportToken}`,
                JSON.stringify({
                  status: 'exporting',
                  progress: progressPercent,
                  message: `Processing: ${progressPercent}%`,
                  type: 'multi-clip-cut-subtitles',
                }),
                { EX: 60 * 60 }
              );
            } catch {
              /* ignore progress update error */
            }
          })
          .on('error', (err: Error) => {
            log.error(`FFmpeg error: ${err.message}`);
            reject(err);
          })
          .on('end', () => {
            log.info('FFmpeg multi-clip+subtitle export completed');
            resolve();
          })
          .save(outputPath);
      });
    }, `multiclip-subtitle-export-${exportToken}`);

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
        type: 'multi-clip-cut-subtitles',
      }),
      { EX: 60 * 60 }
    );

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length,
      clipCount: clips.length,
    };
  } catch (error: any) {
    log.error(`Multi-clip+subtitle export failed: ${error.message}`);

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'error',
        error: error.message,
        type: 'multi-clip-cut-subtitles',
      }),
      { EX: 60 * 60 }
    );

    throw error;
  }
}

export type {
  VideoMetadata,
  SubtitleSegment,
  SubtitleConfig,
  ExportOptions,
  MultiClipExportResult,
};
