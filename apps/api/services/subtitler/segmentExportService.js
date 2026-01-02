import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../../utils/logger.js';
import redisClient from '../../../utils/redis/index.js';
import * as hwaccel from './hwaccelUtils.js';

const require = createRequire(import.meta.url);
import { ffmpeg, ffprobe } from './ffmpegWrapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('segment-export');

const EXPORTS_DIR = path.join(__dirname, '../../../uploads/exports');

/**
 * Get video metadata using ffprobe
 */
async function getVideoMetadata(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

      resolve({
        width: videoStream?.width || 1920,
        height: videoStream?.height || 1080,
        duration: parseFloat(metadata.format.duration) || 0,
        fps: eval(videoStream?.r_frame_rate || '30/1'),
        rotation: videoStream?.rotation || '0',
        originalFormat: {
          codec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
          audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 : null,
          videoBitrate: videoStream?.bit_rate ? parseInt(videoStream.bit_rate) : null
        }
      });
    });
  });
}

/**
 * Build FFmpeg filter_complex for segment trim and concat
 *
 * @param {Array} segments - Array of {start, end} objects
 * @returns {Object} - {filterComplex, outputStreams} for FFmpeg
 */
function buildSegmentFilterComplex(segments) {
  const videoFilters = [];
  const audioFilters = [];
  const videoOutputs = [];
  const audioOutputs = [];

  segments.forEach((segment, index) => {
    const vLabel = `v${index}`;
    const aLabel = `a${index}`;

    videoFilters.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );

    audioFilters.push(
      `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[${aLabel}]`
    );

    videoOutputs.push(`[${vLabel}]`);
    audioOutputs.push(`[${aLabel}]`);
  });

  const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  const filterComplex = [
    ...videoFilters,
    ...audioFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]', '[outa]']
  };
}

/**
 * Build FFmpeg filter_complex for multi-clip segment trim and concat
 *
 * @param {Array} clips - Array of clip objects with clipId
 * @param {Array} segments - Array of {clipId, start, end} objects
 * @returns {Object} - {filterComplex, outputStreams} for FFmpeg
 */
function buildMultiClipFilterComplex(clips, segments) {
  // Create clipId to input index mapping
  const clipInputMap = {};
  clips.forEach((clip, index) => {
    clipInputMap[clip.clipId] = index;
  });

  const videoFilters = [];
  const audioFilters = [];

  segments.forEach((segment, index) => {
    const inputIdx = clipInputMap[segment.clipId];
    if (inputIdx === undefined) {
      log.warn(`Segment ${index} references unknown clipId: ${segment.clipId}`);
      return;
    }

    const vLabel = `v${index}`;
    const aLabel = `a${index}`;

    videoFilters.push(
      `[${inputIdx}:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );

    audioFilters.push(
      `[${inputIdx}:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[${aLabel}]`
    );
  });

  const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  const filterComplex = [
    ...videoFilters,
    ...audioFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]', '[outa]'],
    clipInputMap
  };
}

/**
 * Build FFmpeg filter_complex for multi-clip video-only (no audio)
 */
function buildMultiClipVideoOnlyFilterComplex(clips, segments) {
  const clipInputMap = {};
  clips.forEach((clip, index) => {
    clipInputMap[clip.clipId] = index;
  });

  const videoFilters = [];

  segments.forEach((segment, index) => {
    const inputIdx = clipInputMap[segment.clipId];
    if (inputIdx === undefined) return;

    const vLabel = `v${index}`;
    videoFilters.push(
      `[${inputIdx}:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );
  });

  const concatInputs = segments.map((_, i) => `[v${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=0[outv]`;

  const filterComplex = [
    ...videoFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]'],
    clipInputMap
  };
}

/**
 * Build FFmpeg filter_complex for video-only segments (no audio)
 */
function buildVideoOnlyFilterComplex(segments) {
  const videoFilters = [];
  const videoOutputs = [];

  segments.forEach((segment, index) => {
    const vLabel = `v${index}`;
    videoFilters.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );
    videoOutputs.push(`[${vLabel}]`);
  });

  const concatInputs = segments.map((_, i) => `[v${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=0[outv]`;

  const filterComplex = [
    ...videoFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]']
  };
}

/**
 * Calculate total duration of all segments
 */
function calculateTotalDuration(segments) {
  return segments.reduce((total, seg) => total + (seg.end - seg.start), 0);
}

/**
 * Export video with segment cuts
 *
 * @param {string} inputPath - Path to source video
 * @param {Array} segments - Array of {start, end} segment definitions
 * @param {Object} options - Export options
 * @returns {Promise<Object>} - {exportToken, outputPath, duration}
 */
export async function exportWithSegments(inputPath, segments, options = {}) {
  const exportToken = uuidv4();
  const { projectId, includeSubtitles, subtitleOptions } = options;

  log.info(`Starting segment export, token: ${exportToken}, segments: ${segments.length}`);

  try {
    await fs.access(inputPath);

    const metadata = await getVideoMetadata(inputPath);
    const fileStats = await fs.stat(inputPath);

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    const validSegments = segments.filter(seg =>
      seg.start >= 0 &&
      seg.end > seg.start &&
      seg.end <= metadata.duration + 0.5
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

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'exporting',
      progress: 0,
      message: 'Starting video processing...',
      type: 'segment-cut'
    }), { EX: 60 * 60 });

    const { ffmpegPool } = await import('./ffmpegPool.js');

    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const fileSizeMB = fileStats.size / 1024 / 1024;
    const useHwAccel = await hwaccel.detectVaapi();

    const hasAudio = metadata.originalFormat?.audioCodec != null;

    await ffmpegPool.run(async () => {
      await new Promise((resolve, reject) => {
        const command = ffmpeg(inputPath)
          .setDuration(totalDuration);

        const isLargeFile = fileSizeMB > 200;
        const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
        const { crf, preset } = qualitySettings;

        let audioCodec, audioBitrate;
        const originalAudioCodec = metadata.originalFormat?.audioCodec;
        const originalAudioBitrate = metadata.originalFormat?.audioBitrate;

        if (hasAudio) {
          audioCodec = 'aac';
          audioBitrate = qualitySettings.audioBitrate;
        }

        const is4K = referenceDimension >= 2160;
        const isHevcSource = metadata.originalFormat?.codec === 'hevc';
        let videoCodec;
        let outputOptions;

        const { filterComplex, outputStreams } = hasAudio
          ? buildSegmentFilterComplex(validSegments)
          : buildVideoOnlyFilterComplex(validSegments);

        if (useHwAccel) {
          videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
          const qp = hwaccel.crfToQp(crf);

          command.inputOptions(hwaccel.getVaapiInputOptions());

          outputOptions = [
            '-y',
            '-filter_complex', filterComplex,
            '-map', outputStreams[0],
            ...(hasAudio ? ['-map', outputStreams[1]] : []),
            ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
            ...(hasAudio ? ['-c:a', audioCodec, '-b:a', audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];

          log.debug(`Segment export using VAAPI: ${referenceDimension}p, encoder: ${videoCodec}`);
        } else {
          videoCodec = (is4K && isHevcSource) ? 'libx265' : 'libx264';

          outputOptions = [
            '-y',
            '-filter_complex', filterComplex,
            '-map', outputStreams[0],
            ...(hasAudio ? ['-map', outputStreams[1]] : []),
            '-c:v', videoCodec,
            '-preset', preset,
            '-crf', crf.toString(),
            '-profile:v', videoCodec === 'libx264' ? 'high' : 'main',
            '-level', videoCodec === 'libx264' ? '4.1' : '4.0',
            ...(hasAudio ? ['-c:a', audioCodec, '-b:a', audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];

          if (videoCodec === 'libx264') {
            outputOptions.push(...hwaccel.getX264QualityParams());
          }

          log.debug(`Segment export using CPU: ${referenceDimension}p, CRF: ${crf}`);
        }

        command.outputOptions(outputOptions);

        command
          .on('start', (commandLine) => {
            log.debug('FFmpeg segment export started');
          })
          .on('progress', async (progress) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
            try {
              await redisClient.set(`export:${exportToken}`, JSON.stringify({
                status: 'exporting',
                progress: progressPercent,
                message: `Processing: ${progressPercent}%`,
                type: 'segment-cut'
              }), { EX: 60 * 60 });
            } catch {}
          })
          .on('error', (err) => {
            log.error(`FFmpeg segment export error: ${err.message}`);
            reject(err);
          })
          .on('end', () => {
            log.info('FFmpeg segment export completed');
            resolve();
          })
          .save(outputPath);
      });
    }, `segment-export-${exportToken}`);

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'complete',
      progress: 100,
      outputPath,
      duration: totalDuration,
      type: 'segment-cut'
    }), { EX: 60 * 60 });

    log.info(`Segment export completed: ${outputPath}, duration: ${totalDuration}s`);

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length
    };

  } catch (error) {
    log.error(`Segment export failed: ${error.message}`);

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'error',
      error: error.message,
      type: 'segment-cut'
    }), { EX: 60 * 60 });

    throw error;
  }
}

/**
 * Export video with segments AND subtitles
 * Combines segment cutting with subtitle overlay
 */
export async function exportWithSegmentsAndSubtitles(inputPath, segments, subtitleConfig, options = {}) {
  const exportToken = uuidv4();
  const { projectId } = options;

  log.info(`Starting segment+subtitle export, token: ${exportToken}`);

  try {
    await fs.access(inputPath);

    const metadata = await getVideoMetadata(inputPath);
    const fileStats = await fs.stat(inputPath);

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    const validSegments = segments.filter(seg =>
      seg.start >= 0 &&
      seg.end > seg.start &&
      seg.end <= metadata.duration + 0.5
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

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'exporting',
      progress: 0,
      message: 'Starting video processing with subtitles...',
      type: 'segment-cut-subtitles'
    }), { EX: 60 * 60 });

    const AssSubtitleService = (await import('./assSubtitleService.js')).default;
    const assService = new AssSubtitleService();
    const { ffmpegPool } = await import('./ffmpegPool.js');

    const adjustedSubtitles = adjustSubtitleTimings(
      subtitleConfig.segments,
      validSegments
    );

    const isVertical = metadata.width < metadata.height;
    const styleOptions = {
      fontSize: Math.floor(calculateFontSize(metadata) / 2),
      marginL: 10,
      marginR: 10,
      marginV: subtitleConfig.heightPreference === 'tief'
        ? Math.floor(metadata.height * 0.20)
        : Math.floor(metadata.height * 0.33),
      alignment: 2
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
    } catch (fontCopyError) {
      log.warn(`Font copy failed: ${fontCopyError.message}`);
    }

    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const fileSizeMB = fileStats.size / 1024 / 1024;
    const useHwAccel = await hwaccel.detectVaapi();
    const hasAudio = metadata.originalFormat?.audioCodec != null;

    await ffmpegPool.run(async () => {
      await new Promise((resolve, reject) => {
        const command = ffmpeg(inputPath)
          .setDuration(totalDuration);

        const isLargeFile = fileSizeMB > 200;
        const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
        const { crf, preset } = qualitySettings;

        const audioCodec = 'aac';
        const audioBitrate = qualitySettings.audioBitrate;

        const is4K = referenceDimension >= 2160;
        const isHevcSource = metadata.originalFormat?.codec === 'hevc';

        const { filterComplex: segmentFilter } = hasAudio
          ? buildSegmentFilterComplex(validSegments)
          : buildVideoOnlyFilterComplex(validSegments);

        const fontDir = path.dirname(tempFontPath || assFilePath);
        const subtitleFilter = `subtitles=${assFilePath}:fontsdir=${fontDir}`;

        const combinedFilter = hasAudio
          ? `${segmentFilter};[outv]${subtitleFilter}[finalv]`
          : `${segmentFilter};[outv]${subtitleFilter}[finalv]`;

        let outputOptions;

        if (useHwAccel) {
          const videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
          const qp = hwaccel.crfToQp(crf);

          command.inputOptions(hwaccel.getVaapiInputOptions());

          outputOptions = [
            '-y',
            '-filter_complex', combinedFilter,
            '-map', '[finalv]',
            ...(hasAudio ? ['-map', '[outa]'] : []),
            ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
            ...(hasAudio ? ['-c:a', audioCodec, '-b:a', audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];
        } else {
          const videoCodec = (is4K && isHevcSource) ? 'libx265' : 'libx264';

          outputOptions = [
            '-y',
            '-filter_complex', combinedFilter,
            '-map', '[finalv]',
            ...(hasAudio ? ['-map', '[outa]'] : []),
            '-c:v', videoCodec,
            '-preset', preset,
            '-crf', crf.toString(),
            '-profile:v', videoCodec === 'libx264' ? 'high' : 'main',
            '-level', videoCodec === 'libx264' ? '4.1' : '4.0',
            ...(hasAudio ? ['-c:a', audioCodec, '-b:a', audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];

          if (videoCodec === 'libx264') {
            outputOptions.push(...hwaccel.getX264QualityParams());
          }
        }

        command.outputOptions(outputOptions);

        command
          .on('start', () => {
            log.debug('FFmpeg segment+subtitle export started');
          })
          .on('progress', async (progress) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
            try {
              await redisClient.set(`export:${exportToken}`, JSON.stringify({
                status: 'exporting',
                progress: progressPercent,
                message: `Processing: ${progressPercent}%`,
                type: 'segment-cut-subtitles'
              }), { EX: 60 * 60 });
            } catch {}
          })
          .on('error', (err) => {
            log.error(`FFmpeg error: ${err.message}`);
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
    } catch {}

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'complete',
      progress: 100,
      outputPath,
      duration: totalDuration,
      type: 'segment-cut-subtitles'
    }), { EX: 60 * 60 });

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length
    };

  } catch (error) {
    log.error(`Segment+subtitle export failed: ${error.message}`);

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'error',
      error: error.message,
      type: 'segment-cut-subtitles'
    }), { EX: 60 * 60 });

    throw error;
  }
}

/**
 * Adjust subtitle timings based on video segments
 * Maps original subtitle times to new composed video times
 */
function adjustSubtitleTimings(originalSubtitles, segments) {
  const adjustedSubtitles = [];

  for (const subtitle of originalSubtitles) {
    let composedStartTime = null;
    let composedEndTime = null;
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

    if (composedStartTime !== null && composedEndTime !== null && composedEndTime > composedStartTime) {
      adjustedSubtitles.push({
        ...subtitle,
        startTime: composedStartTime,
        endTime: composedEndTime
      });
    }
  }

  return adjustedSubtitles;
}

function calculateFontSize(metadata) {
  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;

  let minFontSize, maxFontSize, basePercentage;

  if (referenceDimension >= 2160) {
    minFontSize = 80; maxFontSize = 180; basePercentage = isVertical ? 0.070 : 0.065;
  } else if (referenceDimension >= 1440) {
    minFontSize = 60; maxFontSize = 140; basePercentage = isVertical ? 0.065 : 0.060;
  } else if (referenceDimension >= 1080) {
    minFontSize = 40; maxFontSize = 90; basePercentage = isVertical ? 0.054 : 0.0495;
  } else if (referenceDimension >= 720) {
    minFontSize = 35; maxFontSize = 70; basePercentage = isVertical ? 0.055 : 0.050;
  } else {
    minFontSize = 32; maxFontSize = 65; basePercentage = isVertical ? 0.065 : 0.060;
  }

  const totalPixels = metadata.width * metadata.height;
  const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1;
  const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4);

  return Math.max(minFontSize, Math.min(maxFontSize, Math.floor(referenceDimension * adjustedPercentage)));
}

/**
 * Export multi-clip video with segment cuts
 * Handles multiple input video files and combines segments from each
 *
 * @param {Array} clips - Array of {clipId, inputPath} objects
 * @param {Array} segments - Array of {clipId, start, end} segment definitions
 * @param {Object} options - Export options
 * @returns {Promise<Object>} - {exportToken, outputPath, duration}
 */
export async function exportMultiClipWithSegments(clips, segments, options = {}) {
  const exportToken = uuidv4();
  const { projectId } = options;

  log.info(`Starting multi-clip export, token: ${exportToken}, clips: ${clips.length}, segments: ${segments.length}`);

  try {
    // Validate all clip input paths exist
    for (const clip of clips) {
      await fs.access(clip.inputPath);
    }

    // Get metadata from first clip for reference dimensions
    const firstClipMetadata = await getVideoMetadata(clips[0].inputPath);

    // Collect metadata for all clips
    const clipMetadataMap = {};
    for (const clip of clips) {
      clipMetadataMap[clip.clipId] = await getVideoMetadata(clip.inputPath);
    }

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    // Validate segments against their respective clip durations
    const validSegments = segments.filter(seg => {
      const clipMeta = clipMetadataMap[seg.clipId];
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

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'exporting',
      progress: 0,
      message: 'Starting multi-clip video processing...',
      type: 'multi-clip-cut'
    }), { EX: 60 * 60 });

    const { ffmpegPool } = await import('./ffmpegPool.js');

    const isVertical = firstClipMetadata.width < firstClipMetadata.height;
    const referenceDimension = isVertical ? firstClipMetadata.width : firstClipMetadata.height;
    const useHwAccel = await hwaccel.detectVaapi();

    // Check if any clip has audio
    const hasAudio = clips.some(clip => clipMetadataMap[clip.clipId]?.originalFormat?.audioCodec != null);

    await ffmpegPool.run(async () => {
      await new Promise((resolve, reject) => {
        const command = ffmpeg();

        // Add all clips as inputs
        for (const clip of clips) {
          command.input(clip.inputPath);
        }

        command.setDuration(totalDuration);

        const qualitySettings = hwaccel.getQualitySettings(referenceDimension, false);
        const { crf, preset } = qualitySettings;

        const { filterComplex, outputStreams } = hasAudio
          ? buildMultiClipFilterComplex(clips, validSegments)
          : buildMultiClipVideoOnlyFilterComplex(clips, validSegments);

        let outputOptions;

        if (useHwAccel) {
          const is4K = referenceDimension >= 2160;
          const isHevcSource = firstClipMetadata.originalFormat?.codec === 'hevc';
          const videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
          const qp = hwaccel.crfToQp(crf);

          command.inputOptions(hwaccel.getVaapiInputOptions());

          outputOptions = [
            '-y',
            '-filter_complex', filterComplex,
            '-map', outputStreams[0],
            ...(hasAudio && outputStreams[1] ? ['-map', outputStreams[1]] : []),
            ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];

          log.debug(`Multi-clip export using VAAPI: ${clips.length} clips, encoder: ${videoCodec}`);
        } else {
          const is4K = referenceDimension >= 2160;
          const isHevcSource = firstClipMetadata.originalFormat?.codec === 'hevc';
          const videoCodec = (is4K && isHevcSource) ? 'libx265' : 'libx264';

          outputOptions = [
            '-y',
            '-filter_complex', filterComplex,
            '-map', outputStreams[0],
            ...(hasAudio && outputStreams[1] ? ['-map', outputStreams[1]] : []),
            '-c:v', videoCodec,
            '-preset', preset,
            '-crf', crf.toString(),
            '-profile:v', videoCodec === 'libx264' ? 'high' : 'main',
            '-level', videoCodec === 'libx264' ? '4.1' : '4.0',
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];

          if (videoCodec === 'libx264') {
            outputOptions.push(...hwaccel.getX264QualityParams());
          }

          log.debug(`Multi-clip export using CPU: ${clips.length} clips, CRF: ${crf}`);
        }

        command.outputOptions(outputOptions);

        command
          .on('start', (commandLine) => {
            log.debug('FFmpeg multi-clip export started');
          })
          .on('progress', async (progress) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
            try {
              await redisClient.set(`export:${exportToken}`, JSON.stringify({
                status: 'exporting',
                progress: progressPercent,
                message: `Processing: ${progressPercent}%`,
                type: 'multi-clip-cut'
              }), { EX: 60 * 60 });
            } catch {}
          })
          .on('error', (err) => {
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

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'complete',
      progress: 100,
      outputPath,
      duration: totalDuration,
      type: 'multi-clip-cut'
    }), { EX: 60 * 60 });

    log.info(`Multi-clip export completed: ${outputPath}, duration: ${totalDuration}s`);

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length,
      clipCount: clips.length
    };

  } catch (error) {
    log.error(`Multi-clip export failed: ${error.message}`);

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'error',
      error: error.message,
      type: 'multi-clip-cut'
    }), { EX: 60 * 60 });

    throw error;
  }
}

/**
 * Export multi-clip video with segments AND subtitles
 * Combines multi-clip segment cutting with subtitle overlay
 */
export async function exportMultiClipWithSegmentsAndSubtitles(clips, segments, subtitleConfig, options = {}) {
  const exportToken = uuidv4();
  const { projectId } = options;

  log.info(`Starting multi-clip+subtitle export, token: ${exportToken}`);

  try {
    // Validate all clip input paths exist
    for (const clip of clips) {
      await fs.access(clip.inputPath);
    }

    // Get metadata from first clip for reference dimensions
    const firstClipMetadata = await getVideoMetadata(clips[0].inputPath);
    const fileStats = await fs.stat(clips[0].inputPath);

    // Collect metadata for all clips
    const clipMetadataMap = {};
    for (const clip of clips) {
      clipMetadataMap[clip.clipId] = await getVideoMetadata(clip.inputPath);
    }

    if (!segments || segments.length === 0) {
      throw new Error('No segments provided');
    }

    // Validate segments against their respective clip durations
    const validSegments = segments.filter(seg => {
      const clipMeta = clipMetadataMap[seg.clipId];
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

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'exporting',
      progress: 0,
      message: 'Starting multi-clip video processing with subtitles...',
      type: 'multi-clip-cut-subtitles'
    }), { EX: 60 * 60 });

    const AssSubtitleService = (await import('./assSubtitleService.js')).default;
    const assService = new AssSubtitleService();
    const { ffmpegPool } = await import('./ffmpegPool.js');

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
      marginV: subtitleConfig.heightPreference === 'tief'
        ? Math.floor(firstClipMetadata.height * 0.20)
        : Math.floor(firstClipMetadata.height * 0.33),
      alignment: 2
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
    } catch (fontCopyError) {
      log.warn(`Font copy failed: ${fontCopyError.message}`);
    }

    const referenceDimension = isVertical ? firstClipMetadata.width : firstClipMetadata.height;
    const fileSizeMB = fileStats.size / 1024 / 1024;
    const useHwAccel = await hwaccel.detectVaapi();
    const hasAudio = clips.some(clip => clipMetadataMap[clip.clipId]?.originalFormat?.audioCodec != null);

    await ffmpegPool.run(async () => {
      await new Promise((resolve, reject) => {
        const command = ffmpeg();

        // Add all clips as inputs
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

        let outputOptions;

        if (useHwAccel) {
          const videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
          const qp = hwaccel.crfToQp(crf);

          command.inputOptions(hwaccel.getVaapiInputOptions());

          outputOptions = [
            '-y',
            '-filter_complex', combinedFilter,
            '-map', '[finalv]',
            ...(hasAudio ? ['-map', '[outa]'] : []),
            ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];
        } else {
          const videoCodec = (is4K && isHevcSource) ? 'libx265' : 'libx264';

          outputOptions = [
            '-y',
            '-filter_complex', combinedFilter,
            '-map', '[finalv]',
            ...(hasAudio ? ['-map', '[outa]'] : []),
            '-c:v', videoCodec,
            '-preset', preset,
            '-crf', crf.toString(),
            '-profile:v', videoCodec === 'libx264' ? 'high' : 'main',
            '-level', videoCodec === 'libx264' ? '4.1' : '4.0',
            ...(hasAudio ? ['-c:a', 'aac', '-b:a', qualitySettings.audioBitrate] : ['-an']),
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
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
          .on('progress', async (progress) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
            try {
              await redisClient.set(`export:${exportToken}`, JSON.stringify({
                status: 'exporting',
                progress: progressPercent,
                message: `Processing: ${progressPercent}%`,
                type: 'multi-clip-cut-subtitles'
              }), { EX: 60 * 60 });
            } catch {}
          })
          .on('error', (err) => {
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
    } catch {}

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'complete',
      progress: 100,
      outputPath,
      duration: totalDuration,
      type: 'multi-clip-cut-subtitles'
    }), { EX: 60 * 60 });

    return {
      exportToken,
      outputPath,
      duration: totalDuration,
      segmentCount: validSegments.length,
      clipCount: clips.length
    };

  } catch (error) {
    log.error(`Multi-clip+subtitle export failed: ${error.message}`);

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'error',
      error: error.message,
      type: 'multi-clip-cut-subtitles'
    }), { EX: 60 * 60 });

    throw error;
  }
}

/**
 * Adjust subtitle timings for multi-clip segments
 * Maps original subtitle times to new composed video times
 * considering each segment's source clip
 */
function adjustSubtitleTimingsMultiClip(originalSubtitles, segments, clipMetadataMap) {
  const adjustedSubtitles = [];

  for (const subtitle of originalSubtitles) {
    let composedStartTime = null;
    let composedEndTime = null;
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

    if (composedStartTime !== null && composedEndTime !== null && composedEndTime > composedStartTime) {
      adjustedSubtitles.push({
        ...subtitle,
        startTime: composedStartTime,
        endTime: composedEndTime
      });
    }
  }

  return adjustedSubtitles;
}

/**
 * Check if segments use multiple clips
 */
export function isMultiClipExport(segments) {
  if (!segments || segments.length === 0) return false;
  const clipIds = new Set(segments.map(s => s.clipId).filter(Boolean));
  return clipIds.size > 1;
}

/**
 * Get unique clips from segments
 */
export function getUniqueClipsFromSegments(segments, clipRegistry) {
  const clipIds = [...new Set(segments.map(s => s.clipId).filter(Boolean))];
  return clipIds.map(clipId => ({
    clipId,
    ...clipRegistry[clipId]
  })).filter(c => c.clipId);
}

export default {
  exportWithSegments,
  exportWithSegmentsAndSubtitles,
  exportMultiClipWithSegments,
  exportMultiClipWithSegmentsAndSubtitles,
  adjustSubtitleTimings,
  calculateTotalDuration,
  isMultiClipExport,
  getUniqueClipsFromSegments
};
