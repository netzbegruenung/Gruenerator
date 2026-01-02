/**
 * Remotion Export Service
 *
 * Renders videos using Remotion for advanced subtitle styling.
 */

import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { renderVideo } from '../remotion/renderService.js';
import { getFilePathFromUploadId, checkFileExists, getOriginalFilename } from './tusService.js';
import { getVideoMetadata } from './videoUploadService.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

const log = createLogger('remotion-export');

const INTERNAL_VIDEO_BASE_URL = process.env.INTERNAL_API_URL || 'http://localhost:3001/api/subtitler/internal-video';

interface ClipData {
  id?: string;
  uploadId?: string;
  filePath?: string;
  url?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  [key: string]: any;
}

interface Segment {
  id: number;
  clipId?: string;
  start: number;
  end: number;
}

interface TextOverlay {
  text: string;
  startTime: number;
  endTime: number;
  position?: string;
  style?: string;
}

interface ExportParams {
  uploadId?: string;
  projectId?: string;
  userId?: string;
  clips?: Record<string, ClipData>;
  segments?: Segment[];
  subtitles?: string;
  stylePreference?: string;
  heightPreference?: string;
  textOverlays?: TextOverlay[];
  maxResolution?: number | null;
}

interface RenderResult {
  outputPath: string;
  fileSize: number;
  renderTime: number;
}

function getInternalVideoUrl(uploadId: string): string {
  return `${INTERNAL_VIDEO_BASE_URL}/${uploadId}`;
}

async function processRemotionExport(params: ExportParams): Promise<{ exportToken: string }> {
  const {
    uploadId,
    projectId,
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

async function processRemotionExportAsync(exportToken: string, params: ExportParams): Promise<RenderResult> {
  const {
    uploadId,
    clips: frontendClips = {},
    segments: inputSegments = [],
    subtitles = '',
    stylePreference = 'shadow',
    textOverlays = [],
    maxResolution = null
  } = params;

  const segments = [...inputSegments];

  try {
    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'exporting',
      progress: 2,
      message: 'Resolving video sources...'
    }), { EX: 3600 });

    const resolvedClips: Record<string, ClipData> = {};
    let videoWidth = 1920;
    let videoHeight = 1080;
    const fps = 30;
    let originalFilename = 'video.mp4';

    if (Object.keys(frontendClips).length > 0) {
      for (const [clipId, clipData] of Object.entries(frontendClips)) {
        let filePath: string | undefined;

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
            url: getInternalVideoUrl(clipUploadId!),
            width: metadata.width,
            height: metadata.height,
            fps: 30
          };

          if (Object.keys(resolvedClips).length === 1) {
            videoWidth = metadata.width;
            videoHeight = metadata.height;
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

      const defaultClipId = `clip-${uploadId}`;
      resolvedClips[defaultClipId] = {
        id: defaultClipId,
        filePath,
        url: getInternalVideoUrl(uploadId),
        duration: parseFloat(String(metadata.duration)) || 0,
        width: metadata.width,
        height: metadata.height,
        fps: 30
      };

      if (segments.length === 0) {
        segments.push({
          id: 1,
          clipId: defaultClipId,
          start: 0,
          end: parseFloat(String(metadata.duration)) || 0
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
      clips: Object.values(resolvedClips),
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

  } catch (error: any) {
    log.error(`[${exportToken}] Export failed: ${error.message}`);

    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'error',
      progress: 0,
      error: error.message || 'Export failed'
    }), { EX: 3600 });

    throw error;
  }
}

export { processRemotionExport };
export type { ExportParams, ClipData, Segment, TextOverlay, RenderResult };
