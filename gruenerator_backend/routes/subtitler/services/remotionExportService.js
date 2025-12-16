const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { renderVideo, cleanupRender } = require('../../../services/remotion/renderService');
const { getFilePathFromUploadId, checkFileExists, getOriginalFilename } = require('./tusService');
const { getVideoMetadata } = require('./videoUploadService');
const { createLogger } = require('../../../utils/logger');
const redisClient = require('../../../utils/redisClient');

const log = createLogger('remotion-export');

// Internal video URL for Remotion to access videos via HTTP
const INTERNAL_VIDEO_BASE_URL = process.env.INTERNAL_API_URL || 'http://localhost:3001/api/subtitler/internal-video';

function getInternalVideoUrl(uploadId) {
  return `${INTERNAL_VIDEO_BASE_URL}/${uploadId}`;
}

async function processRemotionExport(params) {
  const {
    uploadId,
    projectId,
    userId,
    clips: frontendClips,
    segments,
    subtitles,
    stylePreference = 'shadow',
    heightPreference = 'tief',
    textOverlays = [],
    maxResolution = null
  } = params;

  const exportToken = uuidv4();

  log.info(`[${exportToken}] Starting Remotion export: uploadId=${uploadId}, projectId=${projectId}`);

  await redisClient.set(`export:${exportToken}`, JSON.stringify({
    status: 'starting',
    progress: 0,
    message: 'Initializing export...'
  }), { EX: 3600 });

  processRemotionExportAsync(exportToken, params).catch(error => {
    log.error(`[${exportToken}] Async export failed: ${error.message}`);
  });

  return { exportToken };
}

async function processRemotionExportAsync(exportToken, params) {
  const {
    uploadId,
    projectId,
    userId,
    clips: frontendClips = {},
    segments = [],
    subtitles = '',
    stylePreference = 'shadow',
    heightPreference = 'tief',
    textOverlays = [],
    maxResolution = null
  } = params;

  try {
    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'exporting',
      progress: 2,
      message: 'Resolving video sources...'
    }), { EX: 3600 });

    const resolvedClips = {};
    let videoWidth = 1920;
    let videoHeight = 1080;
    let fps = 30;
    let originalFilename = 'video.mp4';

    if (Object.keys(frontendClips).length > 0) {
      for (const [clipId, clipData] of Object.entries(frontendClips)) {
        let filePath;

        if (clipData.uploadId) {
          filePath = getFilePathFromUploadId(clipData.uploadId);
        } else if (uploadId) {
          filePath = getFilePathFromUploadId(uploadId);
        }

        if (filePath && await checkFileExists(filePath)) {
          const metadata = await getVideoMetadata(filePath);
          const clipUploadId = clipData.uploadId || uploadId;

          resolvedClips[clipId] = {
            ...clipData,
            filePath,
            url: getInternalVideoUrl(clipUploadId),
            width: metadata.width,
            height: metadata.height,
            fps: 30
          };

          if (Object.keys(resolvedClips).length === 1) {
            videoWidth = metadata.width;
            videoHeight = metadata.height;
            fps = 30;
          }
        } else {
          log.warn(`[${exportToken}] Clip not found: ${clipId}`);
        }
      }
    } else if (uploadId) {
      const filePath = getFilePathFromUploadId(uploadId);

      if (!await checkFileExists(filePath)) {
        throw new Error('Video file not found');
      }

      const metadata = await getVideoMetadata(filePath);
      originalFilename = await getOriginalFilename(uploadId) || 'video.mp4';

      videoWidth = metadata.width;
      videoHeight = metadata.height;
      fps = 30;

      const defaultClipId = `clip-${uploadId}`;
      resolvedClips[defaultClipId] = {
        id: defaultClipId,
        filePath,
        url: getInternalVideoUrl(uploadId),
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: 30
      };

      if (segments.length === 0) {
        segments.push({
          id: 1,
          clipId: defaultClipId,
          start: 0,
          end: metadata.duration
        });
      } else {
        segments.forEach(seg => {
          if (!seg.clipId) {
            seg.clipId = defaultClipId;
          }
        });
      }
    }

    if (Object.keys(resolvedClips).length === 0) {
      throw new Error('No valid video clips found');
    }

    let targetWidth = videoWidth;
    let targetHeight = videoHeight;
    if (maxResolution) {
      const isVertical = videoWidth < videoHeight;
      const qualityDimension = isVertical ? videoWidth : videoHeight;

      if (qualityDimension > maxResolution) {
        const aspectRatio = videoWidth / videoHeight;
        if (isVertical) {
          targetWidth = maxResolution;
          targetHeight = Math.round(targetWidth / aspectRatio);
        } else {
          targetHeight = maxResolution;
          targetWidth = Math.round(targetHeight * aspectRatio);
        }
        targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

        log.info(`[${exportToken}] Scaling from ${videoWidth}x${videoHeight} to ${targetWidth}x${targetHeight}`);
      }
    }

    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    const outputFilename = `${baseName}_remotion_${Date.now()}.mp4`;

    const result = await renderVideo({
      clips: resolvedClips,
      segments,
      subtitles,
      stylePreference,
      textOverlays,
      videoWidth: targetWidth,
      videoHeight: targetHeight,
      fps,
      exportToken,
      outputFilename
    });

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'complete',
      progress: 100,
      outputPath: result.outputPath,
      originalFilename,
      fileSize: result.fileSize,
      renderTime: result.renderTime
    }), { EX: 3600 });

    log.info(`[${exportToken}] Export complete: ${result.outputPath}`);

    return result;

  } catch (error) {
    log.error(`[${exportToken}] Export failed: ${error.message}`);

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'error',
      progress: 0,
      error: error.message || 'Export failed'
    }), { EX: 3600 });

    throw error;
  }
}

module.exports = {
  processRemotionExport
};
