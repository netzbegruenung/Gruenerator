/**
 * FFmpeg Export Utilities
 *
 * Builds FFmpeg options for video encoding with quality optimization.
 */

import path from 'path';
import * as hwaccel from './hwaccelUtils.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ffmpeg-export-utils');

interface VideoMetadata {
  width: number;
  height: number;
  rotation?: string;
  originalFormat?: {
    codec?: string;
    videoBitrate?: number;
    audioCodec?: string;
    audioBitrate?: number;
  };
}

interface FileStats {
  size: number;
}

interface AudioCodecSettings {
  audioCodec: string;
  audioBitrate: string | null;
}

interface FFmpegOutputParams {
  metadata: VideoMetadata;
  fileStats: FileStats;
  useHwAccel: boolean;
  includeTune?: boolean;
}

interface FFmpegOutputResult {
  outputOptions: string[];
  videoCodec: string;
  inputOptions: string[];
  qualitySettings: hwaccel.QualitySettings;
}

interface VideoFilterParams {
  assFilePath: string | null;
  tempFontPath: string | null;
  scaleFilter: string | null;
  useHwAccel: boolean;
}

function calculateScaleFilter(metadata: VideoMetadata, maxResolution: number | null): string | null {
  if (!maxResolution) return null;

  const isVertical = metadata.width < metadata.height;
  const qualityDimension = isVertical ? metadata.width : metadata.height;

  if (qualityDimension <= maxResolution) return null;

  const aspectRatio = metadata.width / metadata.height;
  let targetWidth: number, targetHeight: number;

  if (isVertical) {
    targetWidth = maxResolution;
    targetHeight = Math.round(targetWidth / aspectRatio);
  } else {
    targetHeight = maxResolution;
    targetWidth = Math.round(targetHeight * aspectRatio);
  }

  const finalWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  const finalHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

  log.info(`Scaling video from ${metadata.width}x${metadata.height} to ${finalWidth}x${finalHeight}`);
  return `scale=${finalWidth}:${finalHeight}`;
}

function getAudioCodecSettings(metadata: VideoMetadata, qualitySettings: hwaccel.QualitySettings): AudioCodecSettings {
  const originalAudioCodec = metadata.originalFormat?.audioCodec;
  const originalAudioBitrate = metadata.originalFormat?.audioBitrate;

  if (originalAudioCodec === 'aac' && originalAudioBitrate && originalAudioBitrate >= 128) {
    return { audioCodec: 'copy', audioBitrate: null };
  }

  return { audioCodec: 'aac', audioBitrate: qualitySettings.audioBitrate };
}

function buildFFmpegOutputOptions(params: FFmpegOutputParams): FFmpegOutputResult {
  const { metadata, fileStats, useHwAccel, includeTune = true } = params;

  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;
  const fileSizeMB = fileStats.size / 1024 / 1024;
  const isLarge = fileSizeMB > 200;

  const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLarge);
  const { crf, preset } = qualitySettings;
  const { audioCodec, audioBitrate } = getAudioCodecSettings(metadata, qualitySettings);

  const is4K = referenceDimension >= 2160;
  const isHevcSource = metadata.originalFormat?.codec === 'hevc';

  let videoCodec: string;
  let outputOptions: string[];
  let inputOptions: string[] = [];

  if (useHwAccel) {
    videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
    const qp = hwaccel.crfToQp(crf);
    inputOptions = hwaccel.getVaapiInputOptions();

    outputOptions = [
      '-y',
      ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
      '-c:a', audioCodec,
      ...(audioBitrate ? ['-b:a', audioBitrate] : []),
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero'
    ];
  } else {
    videoCodec = isLarge ? 'libx264' : (is4K && isHevcSource ? 'libx265' : 'libx264');

    const originalVideoBitrate = metadata.originalFormat?.videoBitrate;
    let bitrateOptions: string[] = [];

    if (originalVideoBitrate && originalVideoBitrate > 0) {
      const targetBitrate = Math.ceil(originalVideoBitrate * 1.05);
      const maxBitrate = Math.ceil(originalVideoBitrate * 1.15);
      const bufSize = Math.ceil(originalVideoBitrate * 2);
      bitrateOptions = ['-b:v', targetBitrate.toString(), '-maxrate', maxBitrate.toString(), '-bufsize', bufSize.toString()];
    } else {
      bitrateOptions = ['-crf', crf.toString()];
    }

    outputOptions = [
      '-y',
      '-c:v', videoCodec,
      '-preset', preset,
      ...bitrateOptions,
      ...(includeTune && videoCodec === 'libx264' ? ['-tune', 'film'] : []),
      '-profile:v', isLarge ? 'main' : (videoCodec === 'libx264' ? 'high' : 'main'),
      '-level', videoCodec === 'libx264' ? '4.1' : '4.0',
      '-c:a', audioCodec,
      ...(audioBitrate ? ['-b:a', audioBitrate] : []),
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero'
    ];

    if (videoCodec === 'libx264') {
      outputOptions.push(...hwaccel.getX264QualityParams());
    }
  }

  if (metadata.rotation && metadata.rotation !== '0') {
    outputOptions.push('-metadata:s:v:0', `rotate=${metadata.rotation}`);
  }

  return { outputOptions, videoCodec, inputOptions, qualitySettings };
}

function buildVideoFilters(params: VideoFilterParams): string[] {
  const { assFilePath, tempFontPath, scaleFilter, useHwAccel } = params;

  if (useHwAccel) {
    const fontDir = assFilePath ? path.dirname(tempFontPath || assFilePath) : null;
    return [hwaccel.getSubtitleFilterChain(assFilePath, fontDir, scaleFilter)];
  }

  const videoFilters: string[] = [];

  if (assFilePath) {
    const fontDir = path.dirname(tempFontPath || assFilePath);
    videoFilters.push(`subtitles=${assFilePath}:fontsdir=${fontDir}`);
  }

  if (scaleFilter) {
    videoFilters.push(scaleFilter);
  }

  return videoFilters;
}

function getReferenceDimension(metadata: VideoMetadata): number {
  const isVertical = metadata.width < metadata.height;
  return isVertical ? metadata.width : metadata.height;
}

function isLargeFile(fileStats: FileStats): boolean {
  return (fileStats.size / 1024 / 1024) > 200;
}

export { calculateScaleFilter, getAudioCodecSettings, buildFFmpegOutputOptions, buildVideoFilters, getReferenceDimension, isLargeFile };
export type { VideoMetadata, FileStats, AudioCodecSettings, FFmpegOutputParams, FFmpegOutputResult, VideoFilterParams };
