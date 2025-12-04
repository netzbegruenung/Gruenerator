const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const { getVideoMetadata, cleanupFiles } = require('./videoUploadService');
const { getFilePathFromUploadId, checkFileExists } = require('./tusService');
const redisClient = require('../../../utils/redisClient');
const AssSubtitleService = require('./assSubtitleService');
const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('downloadUtils');


// Font configuration
const FONT_PATH = path.resolve(__dirname, '../../../public/fonts/GrueneTypeNeue-Regular.ttf');

// Create ASS service instance
const assService = new AssSubtitleService();

/**
 * Generate a download token and store export parameters in Redis
 */
async function generateDownloadToken(exportParams) {
  const { uploadId, subtitles, subtitlePreference = 'manual', stylePreference = 'standard', heightPreference = 'standard' } = exportParams;

  if (!uploadId || !subtitles) {
    throw new Error('Upload-ID und Untertitel werden benötigt');
  }

  const downloadToken = uuidv4();
  
  const tokenData = {
    uploadId,
    subtitles,
    subtitlePreference,
    stylePreference,
    heightPreference,
    createdAt: Date.now()
  };
  
  // Store with 5-minute expiration
  await redisClient.set(`download:${downloadToken}`, JSON.stringify(tokenData), { EX: 300 });
  
  log.debug(`[Download Token] Generated token ${downloadToken} for uploadId: ${uploadId}`);
  
  return {
    downloadToken,
    downloadUrl: `/api/subtitler/download/${downloadToken}`
  };
}

/**
 * Process direct download via token
 */
async function processDirectDownload(token, res) {
  // Get export parameters from Redis
  const exportParamsString = await redisClient.get(`download:${token}`);
  if (!exportParamsString) {
    throw new Error('Download-Token ungültig oder abgelaufen');
  }
  
  const exportParams = JSON.parse(exportParamsString);
  log.debug(`[Direct Download] Processing token ${token} for uploadId: ${exportParams.uploadId}`);
  
  // Delete token after use (one-time use)
  await redisClient.del(`download:${token}`);
  
  // Process the export using the existing logic
  return await processVideoExport(exportParams, res);
}

/**
 * Process chunked download for large files
 */
async function processChunkedDownload(uploadId, chunkIndex, res) {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  
  // Get processed video path (this would need to be implemented)
  const videoPath = await getProcessedVideoPath(uploadId);
  const fileExists = await checkFileExists(videoPath);
  
  if (!fileExists) {
    throw new Error('Video-Datei für chunked download nicht gefunden');
  }
  
  const stats = await fsPromises.stat(videoPath);
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE - 1, stats.size - 1);
  
  if (start >= stats.size) {
    return res.status(416).json({ error: 'Chunk index out of range' });
  }
  
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  res.setHeader('Content-Type', 'video/mp4');
  
  const stream = fs.createReadStream(videoPath, { start, end });
  stream.pipe(res);
  
  log.debug(`[Chunked Download] Served chunk ${chunkIndex} (${start}-${end}) for ${uploadId}`);
}

/**
 * Core video export processing logic extracted from controller
 */
async function processVideoExport(exportParams, res) {
  const { 
    uploadId, 
    subtitles, 
    subtitlePreference = 'manual',
    stylePreference = 'standard',
    heightPreference = 'standard'
  } = exportParams;
  
  let inputPath = null;
  let outputPath = null;
  let originalFilename = 'video.mp4';
  const exportToken = uuidv4();

  log.debug(`[Export] Starting export with stylePreference: ${stylePreference}, heightPreference: ${heightPreference}`);

  try {
    inputPath = getFilePathFromUploadId(uploadId);
    const fileExists = await checkFileExists(inputPath);
    if (!fileExists) {
      throw new Error('Zugehörige Video-Datei für Export nicht gefunden');
    }
    
    originalFilename = `video_${uploadId}.mp4`;

    await checkFont();
    const metadata = await getVideoMetadata(inputPath);
    
    const fileStats = await fsPromises.stat(inputPath);
    log.debug('Export-Info:', {
      uploadId: uploadId,
      inputGröße: `${(fileStats.size / 1024 / 1024).toFixed(2)}MB`,
      dimensionen: `${metadata.width}x${metadata.height}`,
      rotation: metadata.rotation || 'keine'
    });

    log.debug('Starte Video-Export');
    log.debug('Video-Datei:', inputPath);
    
    const outputDir = path.join(__dirname, '../../../uploads/exports');
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    const outputBaseName = path.basename(originalFilename, path.extname(originalFilename));
    outputPath = path.join(outputDir, `subtitled_${outputBaseName}_${Date.now()}${path.extname(originalFilename)}`);
    log.debug('Ausgabepfad:', outputPath);

    // Process video with subtitles using existing logic
    await processVideoWithSubtitles(inputPath, outputPath, subtitles, metadata, subtitlePreference, stylePreference, heightPreference, exportToken);

    // Stream the result
    await streamVideoFile(outputPath, originalFilename, uploadId, res);

  } catch (error) {
    log.error('Export-Fehler in downloadUtils:', error);
    if (outputPath) {
      await cleanupFiles(null, outputPath);
    }
    throw error;
  }
}

/**
 * Process video with subtitles using FFmpeg
 */
async function processVideoWithSubtitles(inputPath, outputPath, subtitles, metadata, subtitlePreference, stylePreference, heightPreference, exportToken) {
  // Font size calculation logic (extracted from controller)
  const { finalFontSize, finalSpacing } = calculateFontSizes(subtitles, metadata);
  
  // Process subtitle segments
  const segments = processSubtitleSegments(subtitles);
  
  // Generate ASS subtitles
  const { assFilePath, tempFontPath } = await generateAssSubtitles(segments, metadata, subtitlePreference, stylePreference, heightPreference, finalFontSize);
  
  // FFmpeg processing
  await new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);
    
    // Quality optimization
    const { crf, preset, tune, audioCodec, audioBitrate, videoCodec } = calculateQualitySettings(metadata);
    
    const outputOptions = [
      '-y',
      '-c:v', videoCodec,
      '-preset', preset,
      '-crf', crf.toString(),
      '-tune', tune,
      '-profile:v', videoCodec === 'libx264' ? 'high' : 'main',
      '-level', videoCodec === 'libx264' ? '4.1' : '4.0',
      '-c:a', audioCodec,
      ...(audioBitrate ? ['-b:a', audioBitrate] : []),
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero'
    ];

    if (metadata.rotation && metadata.rotation !== '0') {
      outputOptions.push('-metadata:s:v:0', `rotate=${metadata.rotation}`);
    }

    command.outputOptions(outputOptions);

    // Apply ASS subtitles filter if available
    if (assFilePath) {
      const fontDir = path.dirname(tempFontPath);
      command.videoFilters([`subtitles=${assFilePath}:fontsdir=${fontDir}`]);
      log.debug(`[FFmpeg] Applied ASS filter with font directory: ${assFilePath}:fontsdir=${fontDir}`);
    }

    command
      .on('start', cmd => {
        log.debug('[FFmpeg] Processing started');
      })
      .on('progress', async (progress) => {
        const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
        log.debug('Fortschritt:', `${progressPercent}%`);
        
        // Store progress in Redis
        const progressData = {
          status: 'exporting',
          progress: progressPercent,
          timeRemaining: progress.timemark
        };
        try {
          await redisClient.set(`export:${exportToken}`, JSON.stringify(progressData), { EX: 60 * 60 });
        } catch (redisError) {
          log.warn('Redis Progress Update Fehler:', redisError.message);
        }
      })
      .on('error', (err) => {
        log.error('FFmpeg Fehler:', err);
        redisClient.del(`export:${exportToken}`).catch(delErr => log.warn(`[FFmpeg Error Cleanup] Failed to delete progress key export:${exportToken}`, delErr));
        
        // Cleanup ASS files
        if (assFilePath) {
          assService.cleanupTempFile(assFilePath).catch(cleanupErr => log.warn('[FFmpeg Error] ASS cleanup failed:', cleanupErr));
          if (tempFontPath) {
            fsPromises.unlink(tempFontPath).catch(fontErr => log.warn('[FFmpeg Error] Font cleanup failed:', fontErr.message));
          }
        }
        reject(err);
      })
      .on('end', async () => {
        log.debug('FFmpeg Verarbeitung abgeschlossen');
        
        // Cleanup progress and temp files
        try {
          await redisClient.del(`export:${exportToken}`);
        } catch (redisError) {
          log.warn('Redis Progress Cleanup Fehler:', redisError.message);
        }
        
        if (assFilePath) {
          await assService.cleanupTempFile(assFilePath).catch(cleanupErr => log.warn('[FFmpeg Success] ASS cleanup failed:', cleanupErr));
          if (tempFontPath) {
            await fsPromises.unlink(tempFontPath).catch(fontErr => log.warn('[FFmpeg Success] Font cleanup failed:', fontErr.message));
          }
        }
        resolve();
      });

    command.save(outputPath);
  });
}

/**
 * Stream processed video file to client
 */
async function streamVideoFile(outputPath, originalFilename, uploadId, res) {
  // Wait briefly to ensure file is fully written
  await new Promise(resolve => setTimeout(resolve, 1000));

  const stats = await fsPromises.stat(outputPath);
  const fileSize = stats.size;

  const sanitizedFilename = path.basename(originalFilename, path.extname(originalFilename))
    .replace(/[^a-zA-Z0-9_-]/g, '_') + '_mit_untertiteln.mp4';
  
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', fileSize);
  res.setHeader('Content-Disposition', `attachment; filename=${sanitizedFilename}`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  
  const clientInfo = {
    ip: res.req.ip || res.req.connection.remoteAddress,
    userAgent: res.req.get('User-Agent'),
    fileSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`
  };
  log.debug(`[Export] Starting stream for ${uploadId}: ${clientInfo.fileSize} to ${clientInfo.ip}`);
  
  // Track stream progress
  let streamedBytes = 0;
  let isClientConnected = true;
  let cleanupScheduled = false;
  
  const fileStream = fs.createReadStream(outputPath);
  
  // Monitor client connection
  res.on('close', () => {
    isClientConnected = false;
    log.debug(`[Export] Client disconnected for ${uploadId} after ${(streamedBytes / 1024 / 1024).toFixed(2)}MB`);
  });
  
  res.on('finish', () => {
    log.debug(`[Export] Response finished for ${uploadId}: ${(streamedBytes / 1024 / 1024).toFixed(2)}MB sent`);
  });
  
  // Track bytes transferred
  fileStream.on('data', (chunk) => {
    streamedBytes += chunk.length;
  });
  
  fileStream.pipe(res);

  // Enhanced cleanup
  const scheduleCleanup = async (reason) => {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    
    setTimeout(async () => {
      await cleanupFiles(null, outputPath);
      const success = streamedBytes === fileSize;
      log.debug(`[Export] Cleanup completed for ${uploadId} (${reason}): ${success ? 'SUCCESS' : 'PARTIAL'} - ${(streamedBytes / 1024 / 1024).toFixed(2)}MB/${(fileSize / 1024 / 1024).toFixed(2)}MB`);
    }, 2000);
  };

  fileStream.on('end', async () => {
    if (isClientConnected) {
      await scheduleCleanup('stream_end');
    } else {
      await scheduleCleanup('client_disconnected');
    }
  });

  fileStream.on('error', (error) => {
    log.error(`[Export] Stream error for ${uploadId}:`, error.message);
    scheduleCleanup('stream_error');
  });
}

// Helper functions (extracted from controller logic)

async function checkFont() {
  try {
    await fsPromises.access(FONT_PATH);
    log.debug('GrueneTypeNeue Font found for ASS subtitles:', FONT_PATH);
  } catch (err) {
    log.warn('GrueneTypeNeue Font not found, ASS will use system fallback:', err.message);
  }
}

function calculateFontSizes(subtitles, metadata) {
  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;
  const totalPixels = metadata.width * metadata.height;
  
  let minFontSize, maxFontSize, basePercentage;
  
  if (referenceDimension >= 2160) {
    minFontSize = 80;
    maxFontSize = 180;
    basePercentage = isVertical ? 0.070 : 0.065;
  } else if (referenceDimension >= 1440) {
    minFontSize = 60;
    maxFontSize = 140;
    basePercentage = isVertical ? 0.065 : 0.060;
  } else if (referenceDimension >= 1080) {
    minFontSize = 45;
    maxFontSize = 100;
    basePercentage = isVertical ? 0.060 : 0.055;
  } else if (referenceDimension >= 720) {
    minFontSize = 35;
    maxFontSize = 70;
    basePercentage = isVertical ? 0.055 : 0.050;
  } else {
    minFontSize = 32;
    maxFontSize = 65;
    basePercentage = isVertical ? 0.065 : 0.060;
  }
  
  const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1;
  const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4);
  const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(referenceDimension * adjustedPercentage)));

  const minSpacing = 40;
  const maxSpacing = fontSize * 1.25;
  const spacing = Math.max(minSpacing, Math.min(maxSpacing, fontSize * (1.5 + (1 - fontSize/48))));

  // Calculate scale factor based on text length
  const segments = processSubtitleSegments(subtitles);
  let totalChars = 0;
  let totalWords = 0;
  segments.forEach(segment => {
    totalChars += segment.text.length;
    totalWords += segment.text.split(' ').length;
  });
  const avgLength = segments.length > 0 ? totalChars / segments.length : 30;
  const avgWords = segments.length > 0 ? totalWords / segments.length : 5;

  const scaleFactor = calculateScaleFactor(avgLength, avgWords);
  const finalFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(fontSize * scaleFactor)));
  const scaledMaxSpacing = maxSpacing * (scaleFactor > 1 ? scaleFactor : 1);
  const finalSpacing = Math.max(minSpacing, Math.min(scaledMaxSpacing, Math.floor(spacing * scaleFactor)));

  log.debug('Font calculation:', {
    videoDimensionen: `${metadata.width}x${metadata.height}`,
    avgTextLength: avgLength.toFixed(1),
    scaleFactor: scaleFactor.toFixed(2),
    finalFontSize: `${finalFontSize}px`,
    finalSpacing: `${finalSpacing}px`
  });

  return { finalFontSize, finalSpacing };
}

function calculateScaleFactor(avgChars, avgWords) {
  const shortCharThreshold = 20;
  const longCharThreshold = 40;
  const shortWordThreshold = 3;
  const longWordThreshold = 7;
  
  let charFactor;
  if (avgChars <= shortCharThreshold) {
    charFactor = 1.35;
  } else if (avgChars >= longCharThreshold) {
    charFactor = 0.95;
  } else {
    const range = longCharThreshold - shortCharThreshold;
    const position = avgChars - shortCharThreshold;
    charFactor = 1.35 - ((1.35 - 0.95) * (position / range));
  }
  
  let wordFactor;
  if (avgWords <= shortWordThreshold) {
    wordFactor = 1.25;
  } else if (avgWords >= longWordThreshold) {
    wordFactor = 0.95;
  } else {
    const range = longWordThreshold - shortWordThreshold;
    const position = avgWords - shortWordThreshold;
    wordFactor = 1.25 - ((1.25 - 0.95) * (position / range));
  }
  
  return (charFactor * 0.7) + (wordFactor * 0.3);
}

function processSubtitleSegments(subtitles) {
  log.debug('[downloadUtils] Raw subtitles input (last 500 chars):', subtitles.slice(-500));
  
  const preliminarySegments = subtitles
    .split('\n\n')
    .map((block, index) => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return null;
      
      const timeLine = lines[0].trim();
      const timeMatch = timeLine.match(/^(\d{1,2}):(\d{2})\.(\d)\s*-\s*(\d{1,2}):(\d{2})\.(\d)(?:\s*\[(?:HIGHLIGHT|STATIC)\])?$/);
      if (!timeMatch) return null;

      let startMin = parseInt(timeMatch[1]);
      let startSec = parseInt(timeMatch[2]);
      let startFrac = parseInt(timeMatch[3]);
      let endMin = parseInt(timeMatch[4]);
      let endSec = parseInt(timeMatch[5]);
      let endFrac = parseInt(timeMatch[6]);

      // Handle minute overflow
      if (startSec >= 60) {
        startMin += Math.floor(startSec / 60);
        startSec = startSec % 60;
      }
      if (endSec >= 60) {
        endMin += Math.floor(endSec / 60);
        endSec = endSec % 60;
      }
      
      const startTime = startMin * 60 + startSec + (startFrac / 10);
      const endTime = endMin * 60 + endSec + (endFrac / 10);
      
      if (startTime >= endTime) return null;

      const rawText = lines.slice(1).join(' ').trim();
      if (!rawText) return null;
      
      const isHighlight = timeLine.includes('[HIGHLIGHT]');
      const isStatic = timeLine.includes('[STATIC]');
      
      return {
        startTime,
        endTime,
        text: rawText,
        isHighlight,
        isStatic,
        originalText: rawText
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime);

  if (preliminarySegments.length === 0) {
    throw new Error('Keine gültigen Untertitel-Segmente gefunden');
  }

  log.debug(`[downloadUtils] Parsed ${preliminarySegments.length} segments`);
  return preliminarySegments;
}

async function generateAssSubtitles(segments, metadata, subtitlePreference, stylePreference, heightPreference, finalFontSize) {
  const cacheKey = `${Date.now()}_${subtitlePreference}_${stylePreference}_${heightPreference}_${metadata.width}x${metadata.height}`;
  
  let assFilePath = null;
  let tempFontPath = null;

  try {
    const styleOptions = {
      fontSize: Math.floor(finalFontSize / 2),
      marginL: 10,
      marginR: 10,
      marginV: subtitlePreference === 'word' 
        ? Math.floor(metadata.height * 0.50)
        : (heightPreference === 'tief' 
            ? Math.floor(metadata.height * 0.20)
            : Math.floor(metadata.height * 0.33)),
      alignment: subtitlePreference === 'word' ? 5 : 2
    };
    
    const { content: assContent } = assService.generateAssContent(
      segments,
      metadata,
      styleOptions,
      subtitlePreference,
      stylePreference,
      'de-DE',
      heightPreference
    );

    assFilePath = await assService.createTempAssFile(assContent, cacheKey);
    
    // Copy font to temp directory
    tempFontPath = path.join(path.dirname(assFilePath), 'GrueneTypeNeue-Regular.ttf');
    try {
      await fsPromises.copyFile(FONT_PATH, tempFontPath);
      log.debug(`[ASS] Copied font to temp: ${tempFontPath}`);
    } catch (fontCopyError) {
      log.warn('[ASS] Font copy failed, using system fallback:', fontCopyError.message);
      tempFontPath = null;
    }
    
    log.debug(`[ASS] Created ASS file with mode: ${subtitlePreference}, style: ${stylePreference}, height: ${heightPreference}`);
    
  } catch (assError) {
    log.error('[ASS] Error generating ASS subtitles:', assError);
    assFilePath = null;
  }

  return { assFilePath, tempFontPath };
}

function calculateQualitySettings(metadata) {
  const isVertical = metadata.width < metadata.height;
  const referenceDimension = isVertical ? metadata.width : metadata.height;
  
  let crf, preset, tune;
  
  if (referenceDimension >= 2160) {
    crf = 18;
    preset = 'slow';
    tune = 'film';
  } else if (referenceDimension >= 1440) {
    crf = 19;
    preset = 'slow';
    tune = 'film';
  } else if (referenceDimension >= 1080) {
    crf = 20;
    preset = 'medium';
    tune = 'film';
  } else if (referenceDimension >= 720) {
    crf = 21;
    preset = 'medium';
    tune = 'film';
  } else {
    crf = 22;
    preset = 'slower';
    tune = 'film';
  }
  
  log.debug(`[FFmpeg] ${referenceDimension}p, CRF: ${crf}, Preset: ${preset}`);

  // Audio settings
  const originalAudioCodec = metadata.originalFormat?.audioCodec;
  const originalAudioBitrate = metadata.originalFormat?.audioBitrate;
  
  let audioCodec, audioBitrate;
  if (originalAudioCodec === 'aac' && originalAudioBitrate && originalAudioBitrate >= 128) {
    audioCodec = 'copy';
    audioBitrate = null;
  } else {
    audioCodec = 'aac';
    if (referenceDimension >= 1440) {
      audioBitrate = '256k';
    } else if (referenceDimension >= 1080) {
      audioBitrate = '192k';
    } else {
      audioBitrate = '128k';
    }
  }

  // Video codec
  let videoCodec;
  if (referenceDimension >= 2160 && metadata.originalFormat?.codec === 'hevc') {
    videoCodec = 'libx265';
  } else {
    videoCodec = 'libx264';
  }

  return { crf, preset, tune, audioCodec, audioBitrate, videoCodec };
}

// Placeholder function - would need to be implemented based on existing logic
async function getProcessedVideoPath(uploadId) {
  // This would return the path to an already processed video file
  // For chunked downloads, we'd need a way to access completed exports
  return getFilePathFromUploadId(uploadId);
}

module.exports = {
  generateDownloadToken,
  processDirectDownload,
  processChunkedDownload,
  processVideoExport
};