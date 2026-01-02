/**
 * Background Compression Service
 *
 * Compresses large video files in background with quality preservation.
 */

import path from 'path';
import fs from 'fs';
import { ffmpeg } from './ffmpegWrapper.js';
import { redisClient } from '../../utils/redis/index.js';
import { getVideoMetadata, VideoMetadata } from './videoUploadService.js';
import { ffmpegPool } from './ffmpegPool.js';
import { createLogger } from '../../utils/logger.js';
import * as hwaccel from './hwaccelUtils.js';

const fsPromises = fs.promises;
const log = createLogger('backgroundCompr');

interface CompressionSettings {
  crf: number;
  preset: string;
  tune: string;
}

interface TargetResolution {
  width: number;
  height: number;
  scale: number;
}

interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  spaceSaved: number;
}

interface CompressionStatus {
  status: string;
  progress?: number;
  startTime?: number;
  timeRemaining?: string;
  reason?: string;
  error?: string;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: number;
  spaceSaved?: number;
  originalResolution?: string;
  finalResolution?: string;
  resolutionScaled?: boolean;
  attemptedRatio?: number;
  completedAt?: number;
}

const COMPRESSION_CONFIG = {
  MIN_FILE_SIZE_MB: 100,
  MAX_RESOLUTION: {
    WIDTH: 1920,
    HEIGHT: 1080,
    APPLY_TO_FILES_ABOVE_MB: 100
  },
  QUALITY_SETTINGS: {
    HIGH_QUALITY: {
      crf: 19,
      preset: 'slow',
      tune: 'film'
    },
    BALANCED: {
      crf: 21,
      preset: 'medium',
      tune: 'film'
    }
  },
  MIN_COMPRESSION_RATIO: 0.7,
  REDIS_TTL: 60 * 60 * 24
} as const;

function calculateTargetResolution(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): TargetResolution | null {
  if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return null;
  }

  const widthRatio = maxWidth / originalWidth;
  const heightRatio = maxHeight / originalHeight;

  const scale = Math.min(widthRatio, heightRatio);

  let newWidth = Math.floor(originalWidth * scale);
  let newHeight = Math.floor(originalHeight * scale);

  newWidth = newWidth % 2 === 0 ? newWidth : newWidth - 1;
  newHeight = newHeight % 2 === 0 ? newHeight : newHeight - 1;

  return { width: newWidth, height: newHeight, scale };
}

async function shouldCompressVideo(videoPath: string): Promise<boolean> {
  try {
    const stats = await fsPromises.stat(videoPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB < COMPRESSION_CONFIG.MIN_FILE_SIZE_MB) {
      log.debug(`[BackgroundCompression] File too small for compression: ${fileSizeMB.toFixed(2)}MB < ${COMPRESSION_CONFIG.MIN_FILE_SIZE_MB}MB`);
      return false;
    }

    const metadata = await getVideoMetadata(videoPath);
    const codec = metadata.originalFormat?.codec;

    if (codec === 'hevc' || codec === 'av1') {
      log.debug(`[BackgroundCompression] Already efficiently encoded with ${codec}, skipping compression`);
      return false;
    }

    const duration = parseFloat(String(metadata.duration)) || 1;
    const bitrateMbps = (stats.size * 8) / (duration * 1024 * 1024);
    const resolution = metadata.width * metadata.height;

    let expectedBitrateMbps: number;
    if (resolution >= 3840 * 2160) {
      expectedBitrateMbps = 15;
    } else if (resolution >= 1920 * 1080) {
      expectedBitrateMbps = 8;
    } else if (resolution >= 1280 * 720) {
      expectedBitrateMbps = 5;
    } else {
      expectedBitrateMbps = 3;
    }

    if (bitrateMbps <= expectedBitrateMbps * 1.5) {
      log.debug(`[BackgroundCompression] File already efficiently compressed: ${bitrateMbps.toFixed(2)}Mbps <= ${(expectedBitrateMbps * 1.5).toFixed(2)}Mbps`);
      return false;
    }

    const needsResolutionScaling = fileSizeMB >= COMPRESSION_CONFIG.MAX_RESOLUTION.APPLY_TO_FILES_ABOVE_MB &&
      (metadata.width > COMPRESSION_CONFIG.MAX_RESOLUTION.WIDTH || metadata.height > COMPRESSION_CONFIG.MAX_RESOLUTION.HEIGHT);

    log.debug(`[BackgroundCompression] File candidate for compression:`, {
      size: `${fileSizeMB.toFixed(2)}MB`,
      codec,
      bitrate: `${bitrateMbps.toFixed(2)}Mbps`,
      expected: `${expectedBitrateMbps.toFixed(2)}Mbps`,
      resolution: `${metadata.width}x${metadata.height}`,
      needsResolutionScaling
    });

    return true;
  } catch (error: any) {
    log.error('[BackgroundCompression] Error analyzing video for compression:', error);
    return false;
  }
}

async function compressVideoInBackground(originalVideoPath: string, uploadId: string): Promise<CompressionResult | null> {
  const compressionKey = `compression:${uploadId}`;

  try {
    await redisClient.set(compressionKey, JSON.stringify({
      status: 'analyzing',
      progress: 0,
      startTime: Date.now()
    }), { EX: COMPRESSION_CONFIG.REDIS_TTL });

    log.debug(`[BackgroundCompression] Starting analysis for ${uploadId}`);

    const shouldCompress = await shouldCompressVideo(originalVideoPath);
    if (!shouldCompress) {
      await redisClient.set(compressionKey, JSON.stringify({
        status: 'skipped',
        reason: 'File does not need compression',
        progress: 100
      }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
      return null;
    }

    await redisClient.set(compressionKey, JSON.stringify({
      status: 'compressing',
      progress: 5,
      startTime: Date.now()
    }), { EX: COMPRESSION_CONFIG.REDIS_TTL });

    const metadata = await getVideoMetadata(originalVideoPath);
    const originalStats = await fsPromises.stat(originalVideoPath);
    const originalSizeMB = originalStats.size / (1024 * 1024);

    const targetResolution = originalSizeMB >= COMPRESSION_CONFIG.MAX_RESOLUTION.APPLY_TO_FILES_ABOVE_MB
      ? calculateTargetResolution(
        metadata.width,
        metadata.height,
        COMPRESSION_CONFIG.MAX_RESOLUTION.WIDTH,
        COMPRESSION_CONFIG.MAX_RESOLUTION.HEIGHT
      )
      : null;

    const isLargeFile = originalSizeMB > 500;
    const settings: CompressionSettings = isLargeFile
      ? COMPRESSION_CONFIG.QUALITY_SETTINGS.BALANCED
      : COMPRESSION_CONFIG.QUALITY_SETTINGS.HIGH_QUALITY;

    const originalDir = path.dirname(originalVideoPath);
    const originalName = path.basename(originalVideoPath, path.extname(originalVideoPath));
    const extension = path.extname(originalVideoPath);
    const compressedPath = path.join(originalDir, `${originalName}_compressed_temp${extension}`);

    log.debug(`[BackgroundCompression] Starting compression:`, {
      uploadId,
      originalSize: `${originalSizeMB.toFixed(2)}MB`,
      originalResolution: `${metadata.width}x${metadata.height}`,
      targetResolution: targetResolution ? `${targetResolution.width}x${targetResolution.height}` : 'no scaling',
      settings,
      output: compressedPath
    });

    const useHwAccel = await hwaccel.detectVaapi();

    await ffmpegPool.run(async () => {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(originalVideoPath)
          .setDuration(parseFloat(String(metadata.duration)) || 0);

        const is4K = metadata.width >= 2160;
        let videoCodec: string;
        let outputOptions: string[];

        if (useHwAccel) {
          videoCodec = hwaccel.getVaapiEncoder(is4K, false);
          const qp = hwaccel.crfToQp(settings.crf);

          command.inputOptions(hwaccel.getVaapiInputOptions());

          outputOptions = [
            '-y',
            ...hwaccel.getVaapiOutputOptions(qp, videoCodec),
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];

          log.debug(`[BackgroundCompression] Using VAAPI hardware encoding: ${videoCodec}, QP: ${qp}`);
        } else {
          videoCodec = is4K ? 'libx265' : 'libx264';

          outputOptions = [
            '-y',
            '-c:v', videoCodec,
            '-preset', settings.preset,
            '-crf', settings.crf.toString(),
            '-tune', settings.tune,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero'
          ];

          if (videoCodec === 'libx264') {
            outputOptions.push(...hwaccel.getX264QualityParams());
          }

          log.debug(`[BackgroundCompression] Using CPU encoding: ${videoCodec}, CRF: ${settings.crf}`);
        }

        if (metadata.rotation && metadata.rotation !== '0') {
          outputOptions.push('-metadata:s:v:0', `rotate=${metadata.rotation}`);
        }

        const scaleFilter = targetResolution
          ? `scale=${targetResolution.width}:${targetResolution.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`
          : null;

        if (useHwAccel) {
          const filterChain = hwaccel.getCompressionFilterChain(scaleFilter);
          command.videoFilters([filterChain]);
          if (scaleFilter) {
            log.debug(`[BackgroundCompression] Applying VAAPI scaling: ${metadata.width}x${metadata.height} → ${targetResolution?.width}x${targetResolution?.height}`);
          }
        } else if (scaleFilter) {
          command.videoFilters([scaleFilter]);
          log.debug(`[BackgroundCompression] Applying CPU scaling: ${metadata.width}x${metadata.height} → ${targetResolution?.width}x${targetResolution?.height}`);
        }

        command.outputOptions(outputOptions);

        command
          .on('start', (cmd: string) => {
            log.debug(`[BackgroundCompression] FFmpeg started: ${cmd.substring(0, 100)}...`);
            log.debug(`[BackgroundCompression] Full FFmpeg command:`, cmd);

            if (cmd.includes('" -')) {
              log.warn('[BackgroundCompression] Warning: Potential malformed arguments detected in FFmpeg command');
            }
          })
          .on('progress', async (progress: { percent?: number; timemark?: string }) => {
            const progressPercent = Math.min(Math.max(progress.percent || 0, 0), 99);
            const adjustedProgress = 5 + (progressPercent * 0.9);

            try {
              await redisClient.set(compressionKey, JSON.stringify({
                status: 'compressing',
                progress: Math.round(adjustedProgress),
                timeRemaining: progress.timemark,
                startTime: Date.now()
              }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
            } catch (redisError: any) {
              log.warn('[BackgroundCompression] Redis update failed:', redisError.message);
            }
          })
          .on('end', () => {
            log.debug(`[BackgroundCompression] Compression completed for ${uploadId}`);
            resolve();
          })
          .on('error', (err: Error) => {
            log.error(`[BackgroundCompression] FFmpeg error for ${uploadId}:`, err);
            reject(err);
          })
          .save(compressedPath);
      });
    }, `compression-${uploadId}`);

    const compressedStats = await fsPromises.stat(compressedPath);
    const compressedSizeMB = compressedStats.size / (1024 * 1024);
    const compressionRatio = compressedStats.size / originalStats.size;

    log.debug(`[BackgroundCompression] Compression results:`, {
      uploadId,
      originalSize: `${originalSizeMB.toFixed(2)}MB`,
      compressedSize: `${compressedSizeMB.toFixed(2)}MB`,
      ratio: `${(compressionRatio * 100).toFixed(1)}%`,
      saved: `${(originalSizeMB - compressedSizeMB).toFixed(2)}MB`,
      originalResolution: `${metadata.width}x${metadata.height}`,
      finalResolution: targetResolution ? `${targetResolution.width}x${targetResolution.height}` : `${metadata.width}x${metadata.height}`,
      resolutionScaled: !!targetResolution
    });

    if (compressionRatio > COMPRESSION_CONFIG.MIN_COMPRESSION_RATIO) {
      log.debug(`[BackgroundCompression] Compression ratio too low (${(compressionRatio * 100).toFixed(1)}%), keeping original`);
      await fsPromises.unlink(compressedPath);

      await redisClient.set(compressionKey, JSON.stringify({
        status: 'skipped',
        reason: 'Insufficient compression achieved',
        progress: 100,
        originalSize: originalSizeMB,
        attemptedRatio: compressionRatio
      }), { EX: COMPRESSION_CONFIG.REDIS_TTL });

      return null;
    }

    const backupPath = `${originalVideoPath}.backup`;

    await fsPromises.rename(originalVideoPath, backupPath);
    await fsPromises.rename(compressedPath, originalVideoPath);

    setTimeout(async () => {
      try {
        await fsPromises.unlink(backupPath);
        log.debug(`[BackgroundCompression] Backup cleaned up for ${uploadId}`);
      } catch (err: any) {
        log.warn(`[BackgroundCompression] Backup cleanup failed for ${uploadId}:`, err.message);
      }
    }, 60000);

    await redisClient.set(compressionKey, JSON.stringify({
      status: 'completed',
      progress: 100,
      originalSize: originalSizeMB,
      compressedSize: compressedSizeMB,
      compressionRatio,
      spaceSaved: originalSizeMB - compressedSizeMB,
      originalResolution: `${metadata.width}x${metadata.height}`,
      finalResolution: targetResolution ? `${targetResolution.width}x${targetResolution.height}` : `${metadata.width}x${metadata.height}`,
      resolutionScaled: !!targetResolution,
      completedAt: Date.now()
    }), { EX: COMPRESSION_CONFIG.REDIS_TTL });

    log.debug(`[BackgroundCompression] Successfully compressed ${uploadId}: ${originalSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`);
    return {
      originalSize: originalSizeMB,
      compressedSize: compressedSizeMB,
      spaceSaved: originalSizeMB - compressedSizeMB
    };

  } catch (error: any) {
    log.error(`[BackgroundCompression] Error compressing ${uploadId}:`, error);

    try {
      await redisClient.set(compressionKey, JSON.stringify({
        status: 'error',
        error: error.message,
        progress: 0
      }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
    } catch (redisError) {
      log.error('[BackgroundCompression] Failed to set error status in Redis:', redisError);
    }

    return null;
  }
}

async function getCompressionStatus(uploadId: string): Promise<CompressionStatus> {
  try {
    const compressionKey = `compression:${uploadId}`;
    const statusData = await redisClient.get(compressionKey);

    if (!statusData || typeof statusData !== 'string') {
      return { status: 'not_started' };
    }

    return JSON.parse(statusData);
  } catch (error: any) {
    log.error(`[BackgroundCompression] Error getting status for ${uploadId}:`, error);
    return { status: 'error', error: error.message };
  }
}

async function isRedisAvailable(): Promise<boolean> {
  try {
    await redisClient.ping();
    return true;
  } catch {
    return false;
  }
}

function startBackgroundCompression(videoPath: string, uploadId: string): void {
  isRedisAvailable().then((redisOk) => {
    if (!redisOk) {
      log.debug(`[BackgroundCompression] Redis not available, skipping compression for ${uploadId}`);
      return;
    }

    log.debug(`[BackgroundCompression] Redis available, starting compression for ${uploadId}`);

    setImmediate(() => {
      compressVideoInBackground(videoPath, uploadId)
        .then((result) => {
          if (result) {
            log.debug(`[BackgroundCompression] Compression completed for ${uploadId}: saved ${result.spaceSaved.toFixed(2)}MB`);
          }
        })
        .catch((error) => {
          log.warn(`[BackgroundCompression] Compression failed for ${uploadId}:`, error.message);
        });
    });
  }).catch((error) => {
    log.warn(`[BackgroundCompression] Redis check failed for ${uploadId}, skipping compression:`, error.message);
  });
}

export { startBackgroundCompression, getCompressionStatus, shouldCompressVideo, COMPRESSION_CONFIG };
export type { CompressionResult, CompressionStatus, TargetResolution };
