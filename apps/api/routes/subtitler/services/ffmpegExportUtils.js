import path from 'path';
import * as hwaccel from './hwaccelUtils.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('ffmpeg-export-utils');

/**
 * Calculate scale filter for resolution limiting (e.g., Instagram 1080p)
 * @param {Object} metadata - Video metadata with width/height
 * @param {number|null} maxResolution - Max resolution (e.g., 1080), null for no scaling
 * @returns {string|null} - Scale filter string or null
 */
function calculateScaleFilter(metadata, maxResolution) {
  if (!maxResolution) return null;

  const isVertical = metadata.width < metadata.height;
  const qualityDimension = isVertical ? metadata.width : metadata.height;

  if (qualityDimension <= maxResolution) return null;

  const aspectRatio = metadata.width / metadata.height;
  let targetWidth, targetHeight;

  if (isVertical) {
    targetWidth = maxResolution;
    targetHeight = Math.round(targetWidth / aspectRatio);
  } else {
    targetHeight = maxResolution;
    targetWidth = Math.round(targetHeight * aspectRatio);
  }

  const finalWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  const finalHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

  log.info(`Scaling video from ${metadata.width}x${metadata.height} to ${finalWidth}x${finalHeight} (maxResolution: ${maxResolution})`);

  return `scale=${finalWidth}:${finalHeight}`;
}

/**
 * Get audio codec settings based on original format
 * @param {Object} metadata - Video metadata with originalFormat
 * @param {Object} qualitySettings - Quality settings with audioBitrate
 * @returns {Object} - { audioCodec, audioBitrate }
 */
function getAudioCodecSettings(metadata, qualitySettings) {
  const originalAudioCodec = metadata.originalFormat?.audioCodec;
  const originalAudioBitrate = metadata.originalFormat?.audioBitrate;

  if (originalAudioCodec === 'aac' && originalAudioBitrate && originalAudioBitrate >= 128) {
    return { audioCodec: 'copy', audioBitrate: null };
  }

  return { audioCodec: 'aac', audioBitrate: qualitySettings.audioBitrate };
}

/**
 * Build FFmpeg output options for video encoding
 * @param {Object} params - Encoding parameters
 * @returns {Object} - { outputOptions, videoCodec, inputOptions }
 */
function buildFFmpegOutputOptions(params) {
  const {
    metadata,
    fileStats,
    useHwAccel,
    includeTune = true
  } = params;

  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;
  const fileSizeMB = fileStats.size / 1024 / 1024;
  const isLargeFile = fileSizeMB > 200;

  const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
  const { crf, preset } = qualitySettings;
  const { audioCodec, audioBitrate } = getAudioCodecSettings(metadata, qualitySettings);

  const is4K = referenceDimension >= 2160;
  const isHevcSource = metadata.originalFormat?.codec === 'hevc';

  let videoCodec;
  let outputOptions;
  let inputOptions = [];

  if (isLargeFile) {
    log.debug(`Large file (${fileSizeMB.toFixed(1)}MB), using optimized settings: CRF ${crf}, preset ${preset}`);
  }

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

    log.debug(`FFmpeg VAAPI: ${referenceDimension}p, encoder: ${videoCodec}, QP: ${qp}`);
  } else {
    if (isLargeFile) {
      videoCodec = 'libx264';
    } else if (is4K && isHevcSource) {
      videoCodec = 'libx265';
    } else {
      videoCodec = 'libx264';
    }

    const originalVideoBitrate = metadata.originalFormat?.videoBitrate;
    let bitrateOptions = [];

    if (originalVideoBitrate && originalVideoBitrate > 0) {
      const targetBitrate = Math.ceil(originalVideoBitrate * 1.05);
      const maxBitrate = Math.ceil(originalVideoBitrate * 1.15);
      const bufSize = Math.ceil(originalVideoBitrate * 2);
      bitrateOptions = ['-b:v', targetBitrate.toString(), '-maxrate', maxBitrate.toString(), '-bufsize', bufSize.toString()];
      log.debug(`Using original bitrate: ${(originalVideoBitrate / 1000000).toFixed(1)} Mbps → target: ${(targetBitrate / 1000000).toFixed(1)} Mbps`);
    } else {
      bitrateOptions = ['-crf', crf.toString()];
      log.debug(`No original bitrate, using CRF: ${crf}`);
    }

    outputOptions = [
      '-y',
      '-c:v', videoCodec,
      '-preset', preset,
      ...bitrateOptions,
      ...(includeTune && videoCodec === 'libx264' ? ['-tune', 'film'] : []),
      '-profile:v', isLargeFile ? 'main' : (videoCodec === 'libx264' ? 'high' : 'main'),
      '-level', videoCodec === 'libx264' ? '4.1' : '4.0',
      '-c:a', audioCodec,
      ...(audioBitrate ? ['-b:a', audioBitrate] : []),
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero'
    ];

    if (videoCodec === 'libx264') {
      outputOptions.push(...hwaccel.getX264QualityParams());
    }

    log.debug(`FFmpeg CPU: ${referenceDimension}p, CRF: ${crf}, preset: ${preset}`);
  }

  if (metadata.rotation && metadata.rotation !== '0') {
    outputOptions.push('-metadata:s:v:0', `rotate=${metadata.rotation}`);
  }

  return { outputOptions, videoCodec, inputOptions, qualitySettings };
}

/**
 * Build video filter chain with optional scaling and subtitles
 * @param {Object} params - Filter parameters
 * @returns {string[]} - Array of video filters
 */
function buildVideoFilters(params) {
  const {
    assFilePath,
    tempFontPath,
    scaleFilter,
    useHwAccel
  } = params;

  if (useHwAccel) {
    const fontDir = assFilePath ? path.dirname(tempFontPath || assFilePath) : null;
    return [hwaccel.getSubtitleFilterChain(assFilePath, fontDir, scaleFilter)];
  }

  const videoFilters = [];

  // Subtitles FIRST (render at full resolution), then scale
  if (assFilePath) {
    const fontDir = path.dirname(tempFontPath || assFilePath);
    videoFilters.push(`subtitles=${assFilePath}:fontsdir=${fontDir}`);
  }

  if (scaleFilter) {
    videoFilters.push(scaleFilter);
  }

  return videoFilters;
}

/**
 * Calculate reference dimension for quality settings
 * @param {Object} metadata - Video metadata
 * @returns {number} - Reference dimension (smaller of width/height)
 */
function getReferenceDimension(metadata) {
  const isVertical = metadata.width < metadata.height;
  return isVertical ? metadata.width : metadata.height;
}

/**
 * Check if file is considered large (>200MB)
 * @param {Object} fileStats - File stats with size
 * @returns {boolean}
 */
function isLargeFile(fileStats) {
  return (fileStats.size / 1024 / 1024) > 200;
}

export { calculateScaleFilter, getAudioCodecSettings, buildFFmpegOutputOptions, buildVideoFilters, getReferenceDimension, isLargeFile };