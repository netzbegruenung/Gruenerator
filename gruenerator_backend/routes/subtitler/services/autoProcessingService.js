const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../../../utils/logger.js');
const redisClient = require('../../../utils/redisClient.js');
const { detectSilence, calculateTrimPoints } = require('./silenceDetectionService.js');
const { transcribeVideo } = require('./transcriptionService.js');
const { ffmpeg, ffprobe } = require('./ffmpegWrapper.js');
const hwaccel = require('./hwaccelUtils.js');
const AssSubtitleService = require('./assSubtitleService.js');
const { ffmpegPool } = require('./ffmpegPool.js');
const { calculateScaleFilter, buildFFmpegOutputOptions, buildVideoFilters } = require('./ffmpegExportUtils.js');

const assService = new AssSubtitleService();

const log = createLogger('auto-processing');

const EXPORTS_DIR = path.join(__dirname, '../../../uploads/exports');

const STAGES = {
  ANALYZING: { id: 1, name: 'Video wird analysiert...', weight: 15 },
  TRIMMING: { id: 2, name: 'Stille Teile werden entfernt...', weight: 20 },
  SUBTITLES: { id: 3, name: 'Untertitel werden generiert...', weight: 55 },
  FINALIZING: { id: 4, name: 'Wird fertiggestellt...', weight: 10 }
};

/**
 * Update progress in Redis
 * @param {string} uploadId - Upload ID (used as key for frontend polling)
 * @param {Object} progressData - Progress information
 */
async function updateProgress(uploadId, progressData) {
  const data = {
    status: progressData.status || 'processing',
    stage: progressData.stage,
    stageName: progressData.stageName,
    stageProgress: progressData.stageProgress || 0,
    overallProgress: progressData.overallProgress || 0,
    error: progressData.error || null,
    outputPath: progressData.outputPath || null,
    duration: progressData.duration || null
  };

  await redisClient.set(`auto:${uploadId}`, JSON.stringify(data), { EX: 60 * 60 });
}

/**
 * Calculate overall progress based on stage and stage progress
 * @param {number} stageId - Current stage ID (1-5)
 * @param {number} stageProgress - Progress within stage (0-100)
 * @returns {number} - Overall progress (0-100)
 */
function calculateOverallProgress(stageId, stageProgress) {
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

/**
 * Get video metadata using ffprobe
 */
async function getVideoMetadata(inputPath) {
  return new Promise((resolve, reject) => {
    ffprobe(inputPath)
      .then((metadata) => {
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
            audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 : null
          }
        });
      })
      .catch(reject);
  });
}

const TARGET_RESOLUTION = 1080;

/**
 * Pre-scale video to target resolution (1080p for reels)
 * Runs in parallel with transcription to avoid added latency
 */
async function preScaleVideo(inputPath, metadata, targetResolution) {
  const isVertical = metadata.width < metadata.height;

  let targetWidth, targetHeight;
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

  log.info(`Pre-scaling video: ${metadata.width}x${metadata.height} → ${targetWidth}x${targetHeight}`);

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(`scale=${targetWidth}:${targetHeight}`)
      .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'copy'])
      .on('end', resolve)
      .on('error', reject)
      .save(tempPath);
  });

  return tempPath;
}

/**
 * Main automatic video processing function
 *
 * @param {string} inputPath - Path to input video
 * @param {string} uploadId - Upload ID for tracking
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - { outputPath, duration, autoProcessToken }
 */
async function processVideoAutomatically(inputPath, uploadId, options = {}) {
  const autoProcessToken = uuidv4();
  const {
    stylePreference = 'shadow',
    heightPreference = 'tief',
    locale = 'de-DE',
    maxResolution = null
  } = options;

  log.info(`Starting automatic processing for: ${uploadId}, token: ${autoProcessToken}`);

  let preScaledTempPath = null;

  try {
    await updateProgress(uploadId, {
      stage: STAGES.ANALYZING.id,
      stageName: STAGES.ANALYZING.name,
      stageProgress: 0,
      overallProgress: 0
    });

    let metadata = await getVideoMetadata(inputPath);
    const fileStats = await fs.stat(inputPath);
    log.debug(`Video metadata: ${metadata.width}x${metadata.height}, duration: ${metadata.duration}s, size: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB`);

    await updateProgress(uploadId, {
      stage: STAGES.ANALYZING.id,
      stageName: STAGES.ANALYZING.name,
      stageProgress: 50,
      overallProgress: calculateOverallProgress(STAGES.ANALYZING.id, 50)
    });

    let silenceData;
    let trimPoints = { trimStart: 0, trimEnd: metadata.duration, hasTrimming: false };

    try {
      silenceData = await detectSilence(inputPath);
      trimPoints = calculateTrimPoints(silenceData);
    } catch (silenceError) {
      log.warn(`Silence detection failed: ${silenceError.message} - using full video`);
    }

    await updateProgress(uploadId, {
      stage: STAGES.ANALYZING.id,
      stageName: STAGES.ANALYZING.name,
      stageProgress: 100,
      overallProgress: calculateOverallProgress(STAGES.ANALYZING.id, 100)
    });

    await updateProgress(uploadId, {
      stage: STAGES.TRIMMING.id,
      stageName: STAGES.TRIMMING.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.TRIMMING.id, 0)
    });

    let workingVideoPath = inputPath;
    const trimmedDuration = trimPoints.trimEnd - trimPoints.trimStart;

    if (trimPoints.hasTrimming) {
      log.info(`Trimming video: ${trimPoints.trimStart.toFixed(2)}s to ${trimPoints.trimEnd.toFixed(2)}s`);
    }

    await updateProgress(uploadId, {
      stage: STAGES.TRIMMING.id,
      stageName: STAGES.TRIMMING.name,
      stageProgress: 100,
      overallProgress: calculateOverallProgress(STAGES.TRIMMING.id, 100)
    });

    await updateProgress(uploadId, {
      stage: STAGES.SUBTITLES.id,
      stageName: STAGES.SUBTITLES.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.SUBTITLES.id, 0)
    });

    // Check if video needs pre-scaling (larger than 1080p)
    const needsPreScale = metadata.width > TARGET_RESOLUTION ||
                          (metadata.height > TARGET_RESOLUTION && metadata.width >= metadata.height);

    let subtitles;

    try {
      // Run transcription and pre-scaling in PARALLEL
      // Gladia only needs audio, so original video is fine for transcription
      // Pre-scaling happens during Gladia API wait time = zero added latency
      const [transcriptionResult, scaledPath] = await Promise.all([
        transcribeVideo(inputPath, 'manual', null, 'de'),
        needsPreScale
          ? preScaleVideo(inputPath, metadata, TARGET_RESOLUTION)
          : Promise.resolve(null)
      ]);

      subtitles = transcriptionResult;
      log.info(`Transcription complete: ${subtitles.split('\n\n').length} segments`);

      // Use scaled video for export if it was created
      if (scaledPath) {
        workingVideoPath = scaledPath;
        preScaledTempPath = scaledPath;
        metadata = await getVideoMetadata(workingVideoPath);
        log.info(`Pre-scaled video ready: ${metadata.width}x${metadata.height}`);
      }
    } catch (transcriptionError) {
      log.error(`Transcription/scaling failed: ${transcriptionError.message}`);
      // Cleanup pre-scaled file if it exists
      if (preScaledTempPath) {
        await fs.unlink(preScaledTempPath).catch(() => {});
      }
      await updateProgress(uploadId, {
        status: 'error',
        stage: STAGES.SUBTITLES.id,
        stageName: STAGES.SUBTITLES.name,
        error: 'Untertitel konnten nicht generiert werden. Bitte versuche es erneut.'
      });
      throw transcriptionError;
    }

    await updateProgress(uploadId, {
      stage: STAGES.SUBTITLES.id,
      stageName: STAGES.SUBTITLES.name,
      stageProgress: 100,
      overallProgress: calculateOverallProgress(STAGES.SUBTITLES.id, 100)
    });

    await updateProgress(uploadId, {
      stage: STAGES.FINALIZING.id,
      stageName: STAGES.FINALIZING.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.FINALIZING.id, 0)
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
        maxResolution: null, // Already scaled, no further scaling needed
        autoProcessToken,
        uploadId
      }
    );

    await updateProgress(uploadId, {
      stage: STAGES.FINALIZING.id,
      stageName: STAGES.FINALIZING.name,
      stageProgress: 0,
      overallProgress: calculateOverallProgress(STAGES.FINALIZING.id, 0)
    });

    await updateProgress(uploadId, {
      status: 'processing_done',
      stage: STAGES.FINALIZING.id,
      stageName: STAGES.FINALIZING.name,
      stageProgress: 100,
      overallProgress: 100,
      outputPath,
      duration: trimmedDuration
    });

    log.info(`Automatic processing complete: ${outputPath}`);

    // Cleanup pre-scaled temp file
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
      metadata
    };

  } catch (error) {
    log.error(`Automatic processing failed: ${error.message}`);

    // Cleanup pre-scaled temp file on error
    if (preScaledTempPath) {
      await fs.unlink(preScaledTempPath).catch(() => {});
    }

    await updateProgress(uploadId, {
      status: 'error',
      error: error.message || 'Verarbeitung fehlgeschlagen'
    });

    throw error;
  }
}

/**
 * Export video with trim and subtitles in a single pass
 */
async function exportWithEnhancements(inputPath, subtitles, trimPoints, metadata, fileStats, options) {
  const {
    stylePreference,
    heightPreference,
    locale,
    maxResolution,
    autoProcessToken,
    uploadId
  } = options;

  await fs.mkdir(EXPORTS_DIR, { recursive: true });
  const outputFilename = `auto_${autoProcessToken}_${Date.now()}.mp4`;
  const outputPath = path.join(EXPORTS_DIR, outputFilename);

  const subtitleSegments = parseSubtitlesToSegments(subtitles, trimPoints);

  const styleOptions = {
    fontSize: calculateFontSize(metadata),
    marginL: 10,
    marginR: 10,
    marginV: heightPreference === 'tief'
      ? Math.floor(metadata.height * 0.20)
      : Math.floor(metadata.height * 0.33),
    alignment: 2
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
  } catch (fontCopyError) {
    log.warn(`Font copy failed: ${fontCopyError.message}`);
  }

  const useHwAccel = await hwaccel.detectVaapi();
  const hasAudio = metadata.originalFormat?.audioCodec != null;
  const scaleFilter = calculateScaleFilter(metadata, maxResolution);

  const { outputOptions: baseOutputOptions, inputOptions } = buildFFmpegOutputOptions({
    metadata,
    fileStats,
    useHwAccel,
    includeTune: false
  });

  const videoFilters = buildVideoFilters({
    assFilePath,
    tempFontPath,
    scaleFilter,
    useHwAccel
  });

  await ffmpegPool.run(async () => {
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .setDuration(trimmedDuration);

      if (inputOptions.length > 0) {
        command.inputOptions(inputOptions);
      }

      const outputOptions = [
        ...baseOutputOptions,
        '-ss', trimPoints.trimStart.toString(),
        '-t', trimmedDuration.toString()
      ];

      if (!hasAudio) {
        const audioIndex = outputOptions.findIndex(opt => opt === '-c:a');
        if (audioIndex !== -1) {
          const bitrateIndex = outputOptions.findIndex((opt, i) => i > audioIndex && opt === '-b:a');
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
        .on('progress', async (progress) => {
          const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
          try {
            await updateProgress(uploadId, {
              stage: STAGES.FINALIZING.id,
              stageName: STAGES.FINALIZING.name,
              stageProgress: progressPercent,
              overallProgress: calculateOverallProgress(STAGES.FINALIZING.id, progressPercent)
            });
          } catch {}
        })
        .on('error', (err) => {
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
  } catch {}

  return outputPath;
}

/**
 * Parse subtitle text format to segment objects
 * Adjusts timing based on trim points
 */
function parseSubtitlesToSegments(subtitles, trimPoints) {
  const segments = [];
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
      text
    });
  }

  return segments;
}

/**
 * Calculate font size based on video dimensions
 */
function calculateFontSize(metadata) {
  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;

  let basePercentage;
  if (referenceDimension >= 2160) {
    basePercentage = isVertical ? 0.035 : 0.0325;
  } else if (referenceDimension >= 1080) {
    basePercentage = isVertical ? 0.027 : 0.025;
  } else {
    basePercentage = isVertical ? 0.033 : 0.030;
  }

  return Math.floor(referenceDimension * basePercentage);
}

/**
 * Get auto processing progress
 * @param {string} token - Auto process token
 * @returns {Promise<Object|null>} - Progress data or null
 */
async function getAutoProgress(token) {
  const data = await redisClient.get(`auto:${token}`);
  if (!data) return null;
  return JSON.parse(data);
}

module.exports = {
  processVideoAutomatically,
  getAutoProgress,
  STAGES
};
