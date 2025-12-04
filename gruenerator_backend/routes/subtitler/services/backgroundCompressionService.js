const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const redisClient = require('../../../utils/redisClient');
const { getVideoMetadata } = require('./videoUploadService');
const { ffmpegPool } = require('./ffmpegPool');
const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('backgroundCompr');


ffmpeg.setFfmpegPath(ffmpegPath);

// Configuration for background compression
const COMPRESSION_CONFIG = {
  // File size threshold for compression (100MB)
  MIN_FILE_SIZE_MB: 100,
  // Resolution settings for files >100MB
  MAX_RESOLUTION: {
    WIDTH: 1920,
    HEIGHT: 1080,
    // Only apply resolution scaling to files above this threshold
    APPLY_TO_FILES_ABOVE_MB: 100
  },
  // Compression settings for different scenarios
  QUALITY_SETTINGS: {
    // High quality compression - minimal quality loss
    HIGH_QUALITY: {
      crf: 18,
      preset: 'slow',
      tune: 'film'
    },
    // Balanced compression for very large files
    BALANCED: {
      crf: 20,
      preset: 'medium', 
      tune: 'film'
    }
  },
  // Expected compression ratios to avoid unnecessary processing
  MIN_COMPRESSION_RATIO: 0.7, // Only compress if we can achieve at least 30% reduction
  // Redis TTL for compression status (24 hours)
  REDIS_TTL: 60 * 60 * 24
};

/**
 * Calculates target resolution for scaling, preserving aspect ratio
 */
function calculateTargetResolution(originalWidth, originalHeight, maxWidth, maxHeight) {
  // If already within limits, no scaling needed
  if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return null;
  }
  
  // Calculate scaling ratios
  const widthRatio = maxWidth / originalWidth;
  const heightRatio = maxHeight / originalHeight;
  
  // Use the smaller ratio to ensure both dimensions fit within limits
  const scale = Math.min(widthRatio, heightRatio);
  
  // Calculate new dimensions
  let newWidth = Math.floor(originalWidth * scale);
  let newHeight = Math.floor(originalHeight * scale);
  
  // Ensure even dimensions (required by most video codecs)
  newWidth = newWidth % 2 === 0 ? newWidth : newWidth - 1;
  newHeight = newHeight % 2 === 0 ? newHeight : newHeight - 1;
  
  return {
    width: newWidth,
    height: newHeight,
    scale: scale
  };
}

/**
 * Analyzes if a video file should be compressed
 */
async function shouldCompressVideo(videoPath) {
  try {
    const stats = await fsPromises.stat(videoPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    // Check file size threshold
    if (fileSizeMB < COMPRESSION_CONFIG.MIN_FILE_SIZE_MB) {
      log.debug(`[BackgroundCompression] File too small for compression: ${fileSizeMB.toFixed(2)}MB < ${COMPRESSION_CONFIG.MIN_FILE_SIZE_MB}MB`);
      return false;
    }
    
    // Get video metadata to analyze encoding
    const metadata = await getVideoMetadata(videoPath);
    const codec = metadata.originalFormat?.codec;
    
    // Skip if already efficiently encoded with modern codec
    if (codec === 'hevc' || codec === 'av1') {
      log.debug(`[BackgroundCompression] Already efficiently encoded with ${codec}, skipping compression`);
      return false;
    }
    
    // Check if file is likely already compressed (based on bitrate estimation)
    const duration = metadata.duration;
    const bitrateMbps = (stats.size * 8) / (duration * 1024 * 1024);
    const resolution = metadata.width * metadata.height;
    
    // Estimate expected bitrate for this resolution
    let expectedBitrateMbps;
    if (resolution >= 3840 * 2160) { // 4K
      expectedBitrateMbps = 15;
    } else if (resolution >= 1920 * 1080) { // 1080p
      expectedBitrateMbps = 8;
    } else if (resolution >= 1280 * 720) { // 720p
      expectedBitrateMbps = 5;
    } else {
      expectedBitrateMbps = 3;
    }
    
    // If current bitrate is already reasonable, skip compression
    if (bitrateMbps <= expectedBitrateMbps * 1.5) {
      log.debug(`[BackgroundCompression] File already efficiently compressed: ${bitrateMbps.toFixed(2)}Mbps <= ${(expectedBitrateMbps * 1.5).toFixed(2)}Mbps`);
      return false;
    }
    
    // Check if resolution scaling would be beneficial for large files
    const needsResolutionScaling = fileSizeMB >= COMPRESSION_CONFIG.MAX_RESOLUTION.APPLY_TO_FILES_ABOVE_MB && 
      (metadata.width > COMPRESSION_CONFIG.MAX_RESOLUTION.WIDTH || metadata.height > COMPRESSION_CONFIG.MAX_RESOLUTION.HEIGHT);
    
    log.debug(`[BackgroundCompression] File candidate for compression:`, {
      size: `${fileSizeMB.toFixed(2)}MB`,
      codec,
      bitrate: `${bitrateMbps.toFixed(2)}Mbps`,
      expected: `${expectedBitrateMbps.toFixed(2)}Mbps`,
      resolution: `${metadata.width}x${metadata.height}`,
      needsResolutionScaling: needsResolutionScaling
    });
    
    return true;
  } catch (error) {
    log.error('[BackgroundCompression] Error analyzing video for compression:', error);
    return false;
  }
}

/**
 * Compresses video file in background with quality preservation
 */
async function compressVideoInBackground(originalVideoPath, uploadId) {
  const compressionKey = `compression:${uploadId}`;
  
  try {
    // Set initial compression status
    await redisClient.set(compressionKey, JSON.stringify({
      status: 'analyzing',
      progress: 0,
      startTime: Date.now()
    }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
    
    log.debug(`[BackgroundCompression] Starting analysis for ${uploadId}`);
    
    // Check if compression is needed
    const shouldCompress = await shouldCompressVideo(originalVideoPath);
    if (!shouldCompress) {
      await redisClient.set(compressionKey, JSON.stringify({
        status: 'skipped',
        reason: 'File does not need compression',
        progress: 100
      }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
      return null;
    }
    
    // Update status to compressing
    await redisClient.set(compressionKey, JSON.stringify({
      status: 'compressing',
      progress: 5,
      startTime: Date.now()
    }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
    
    // Get metadata and original file size
    const metadata = await getVideoMetadata(originalVideoPath);
    const originalStats = await fsPromises.stat(originalVideoPath);
    const originalSizeMB = originalStats.size / (1024 * 1024);
    
    // Calculate target resolution if scaling is needed
    const targetResolution = originalSizeMB >= COMPRESSION_CONFIG.MAX_RESOLUTION.APPLY_TO_FILES_ABOVE_MB ?
      calculateTargetResolution(
        metadata.width, 
        metadata.height, 
        COMPRESSION_CONFIG.MAX_RESOLUTION.WIDTH, 
        COMPRESSION_CONFIG.MAX_RESOLUTION.HEIGHT
      ) : null;
    
    // Determine compression settings
    const isLargeFile = originalSizeMB > 500;
    const settings = isLargeFile ? 
      COMPRESSION_CONFIG.QUALITY_SETTINGS.BALANCED : 
      COMPRESSION_CONFIG.QUALITY_SETTINGS.HIGH_QUALITY;
    
    // Create compressed file path
    const originalDir = path.dirname(originalVideoPath);
    const originalName = path.basename(originalVideoPath, path.extname(originalVideoPath));
    const extension = path.extname(originalVideoPath);
    const compressedPath = path.join(originalDir, `${originalName}_compressed_temp${extension}`);
    
    log.debug(`[BackgroundCompression] Starting compression:`, {
      uploadId,
      originalSize: `${originalSizeMB.toFixed(2)}MB`,
      originalResolution: `${metadata.width}x${metadata.height}`,
      targetResolution: targetResolution ? `${targetResolution.width}x${targetResolution.height}` : 'no scaling',
      settings: settings,
      output: compressedPath
    });
    
    // Perform compression - wrapped in pool to limit concurrent FFmpeg processes
    await ffmpegPool.run(async () => {
      await new Promise((resolve, reject) => {
        const command = ffmpeg(originalVideoPath);
      
      // Intelligent codec selection
      const videoCodec = metadata.width >= 2160 ? 'libx265' : 'libx264';
      
      // Optimized compression settings
      const outputOptions = [
        '-y', // Overwrite output
        '-c:v', videoCodec,
        '-preset', settings.preset,
        '-crf', settings.crf.toString(),
        '-tune', settings.tune,
        // Audio preservation - copy if already AAC and good quality
        '-c:a', 'aac',
        '-b:a', '192k', // Good quality audio
        // Container optimizations
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero'
      ];
      
      // Preserve metadata including rotation
      if (metadata.rotation && metadata.rotation !== '0') {
        outputOptions.push('-metadata:s:v:0', `rotate=${metadata.rotation}`);
      }
      
      // Apply video filters if needed (resolution scaling)
      const videoFilters = [];
      if (targetResolution) {
        // Scale video to target resolution, preserving aspect ratio and ensuring even dimensions
        videoFilters.push(`scale=${targetResolution.width}:${targetResolution.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`);
        log.debug(`[BackgroundCompression] Applying resolution scaling: ${metadata.width}x${metadata.height} → ${targetResolution.width}x${targetResolution.height}`);
      }
      
      command
        .outputOptions(outputOptions);
      
      // Apply video filters if any
      if (videoFilters.length > 0) {
        command.videoFilters(videoFilters);
      }
      
      command
        .on('start', (cmd) => {
          log.debug(`[BackgroundCompression] FFmpeg started: ${cmd.substring(0, 100)}...`);
          log.debug(`[BackgroundCompression] Full FFmpeg command:`, cmd);
          
          // Validate command structure
          if (cmd.includes('" -')) {
            log.warn('[BackgroundCompression] Warning: Potential malformed arguments detected in FFmpeg command');
          }
        })
        .on('progress', async (progress) => {
          const progressPercent = Math.min(Math.max(progress.percent || 0, 0), 99);
          const adjustedProgress = 5 + (progressPercent * 0.9); // 5-95% range
          
          try {
            await redisClient.set(compressionKey, JSON.stringify({
              status: 'compressing',
              progress: Math.round(adjustedProgress),
              timeRemaining: progress.timemark,
              startTime: Date.now()
            }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
          } catch (redisError) {
            log.warn('[BackgroundCompression] Redis update failed:', redisError.message);
          }
        })
        .on('end', () => {
          log.debug(`[BackgroundCompression] Compression completed for ${uploadId}`);
          resolve();
        })
        .on('error', (err) => {
          log.error(`[BackgroundCompression] FFmpeg error for ${uploadId}:`, err);
          reject(err);
        })
        .save(compressedPath);
      });
    }, `compression-${uploadId}`);

    // Verify compression results
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
    
    // Check if compression was worthwhile
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
    
    // Replace original file with compressed version
    const backupPath = `${originalVideoPath}.backup`;
    
    // Create backup of original
    await fsPromises.rename(originalVideoPath, backupPath);
    
    // Move compressed file to original location
    await fsPromises.rename(compressedPath, originalVideoPath);
    
    // Clean up backup after a delay (keep for safety)
    setTimeout(async () => {
      try {
        await fsPromises.unlink(backupPath);
        log.debug(`[BackgroundCompression] Backup cleaned up for ${uploadId}`);
      } catch (err) {
        log.warn(`[BackgroundCompression] Backup cleanup failed for ${uploadId}:`, err.message);
      }
    }, 60000); // Delete backup after 1 minute
    
    // Update final status
    await redisClient.set(compressionKey, JSON.stringify({
      status: 'completed',
      progress: 100,
      originalSize: originalSizeMB,
      compressedSize: compressedSizeMB,
      compressionRatio: compressionRatio,
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
    
  } catch (error) {
    log.error(`[BackgroundCompression] Error compressing ${uploadId}:`, error);
    
    // Set error status
    try {
      await redisClient.set(compressionKey, JSON.stringify({
        status: 'error',
        error: error.message,
        progress: 0
      }), { EX: COMPRESSION_CONFIG.REDIS_TTL });
    } catch (redisError) {
      log.error('[BackgroundCompression] Failed to set error status in Redis:', redisError);
    }
    
    // Clean up any temporary files
    const tempPath = path.join(path.dirname(originalVideoPath), `*_compressed_temp*`);
    // Note: In production, implement proper cleanup of temp files
    
    return null;
  }
}

/**
 * Gets compression status for an upload
 */
async function getCompressionStatus(uploadId) {
  try {
    const compressionKey = `compression:${uploadId}`;
    const statusData = await redisClient.get(compressionKey);
    
    if (!statusData) {
      return { status: 'not_started' };
    }
    
    return JSON.parse(statusData);
  } catch (error) {
    log.error(`[BackgroundCompression] Error getting status for ${uploadId}:`, error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Check if Redis is available for compression tracking
 */
async function isRedisAvailable() {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Starts background compression (non-blocking)
 */
function startBackgroundCompression(videoPath, uploadId) {
  // Check Redis availability first
  isRedisAvailable().then((redisOk) => {
    if (!redisOk) {
      log.debug(`[BackgroundCompression] Redis not available, skipping compression for ${uploadId}`);
      return;
    }
    
    log.debug(`[BackgroundCompression] Redis available, starting compression for ${uploadId}`);
    
    // Start compression in background without blocking
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

module.exports = {
  startBackgroundCompression,
  getCompressionStatus,
  shouldCompressVideo,
  COMPRESSION_CONFIG
};