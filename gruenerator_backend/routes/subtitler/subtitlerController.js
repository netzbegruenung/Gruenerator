const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { ffmpeg } = require('./services/ffmpegWrapper.js');
const { getVideoMetadata, cleanupFiles } = require('./services/videoUploadService');
const { transcribeVideo } = require('./services/transcriptionService');
const { getFilePathFromUploadId, checkFileExists, markUploadAsProcessed, scheduleImmediateCleanup } = require('./services/tusService');
const redisClient = require('../../utils/redisClient');
const { v4: uuidv4 } = require('uuid');
const AssSubtitleService = require('./services/assSubtitleService');
const { generateDownloadToken, processDirectDownload, processChunkedDownload } = require('./services/downloadUtils');
const { getCompressionStatus } = require('./services/backgroundCompressionService');
const { ffmpegPool } = require('./services/ffmpegPool');
const { createLogger } = require('../../utils/logger.js');
const { correctSubtitlesViaAI } = require('./services/subtitleCorrectionService');
const hwaccel = require('./services/hwaccelUtils.js');

const log = createLogger('subtitler');

// Font configuration
const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneTypeNeue-Regular.ttf');

// Create ASS service instance
const assService = new AssSubtitleService();

// Check if the font exists (optional for ASS - will fallback to system fonts)
async function checkFont() {
  try {
    await fsPromises.access(FONT_PATH);
    log.debug('Font found for ASS subtitles');
  } catch (err) {
    log.warn(`Font not found, using system fallback: ${err.message}`);
  }
}

// Route for video upload and processing
router.post('/process', async (req, res) => {
  const { 
    uploadId, 
    subtitlePreference = 'manual', // ONLY manual mode supported - word mode commented out
    stylePreference = 'standard',
    heightPreference = 'standard' // Height positioning: 'standard' or 'tief'
  } = req.body; // Expect uploadId, subtitlePreference (manual only), stylePreference, and heightPreference
  let videoPath = null;

  if (!uploadId) {
    log.error('No uploadId in request');
    return res.status(400).json({ error: 'Keine Upload-ID gefunden' });
  }

  log.debug(`Processing request for uploadId: ${uploadId}, mode: ${subtitlePreference}, style: ${stylePreference}`);

  // Create unique Redis key with mode, stylePreference, and heightPreference
  const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;
  
  // Set initial status in Redis with TTL (e.g., 24 hours)
  const initialStatus = JSON.stringify({ status: 'processing' });
  try {
      await redisClient.set(jobKey, initialStatus, { EX: 60 * 60 * 24 });
      log.debug(`Redis status 'processing' set for ${jobKey}`);
  } catch (redisError) {
      log.error(`Redis error setting initial status for ${jobKey}: ${redisError.message}`);
      // Send error response to client if not already sent
       if (!res.headersSent) {
          return res.status(500).json({ error: 'Interner Serverfehler beim Start der Verarbeitung (Redis).' });
       }
       // Abort further processing if status could not be set
       return; 
  }

  try {
    videoPath = getFilePathFromUploadId(uploadId);
    log.debug(`Video path: ${videoPath}`);

    const fileExists = await checkFileExists(videoPath);
    if (!fileExists) {
        log.error(`Video file not found for uploadId: ${uploadId}`);
        
        // Plane sofortiges Cleanup für nicht existierende Dateien
        scheduleImmediateCleanup(uploadId, 'file not found');
        
        // Set error status in Redis
        const errorNotFoundStatus = JSON.stringify({ status: 'error', data: 'Zugehörige Video-Datei nicht gefunden.' });
        try {
            await redisClient.set(jobKey, errorNotFoundStatus, { EX: 60 * 60 * 24 });
        } catch (redisSetError) {
             log.error(`Redis error setting 'file not found' status: ${redisSetError.message}`);
        }
        return res.status(404).json({ error: 'Zugehörige Video-Datei nicht gefunden.' });
    }

    // Get file stats for logging
    const fileStats = await fsPromises.stat(videoPath);

    log.info(`Processing ${uploadId}: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB, mode: ${subtitlePreference}`);
    
    // Run transcription asynchronously
    // Corrected call: Pass subtitlePreference as the second parameter and the aiWorkerPool
    const aiWorkerPool = req.app.locals.aiWorkerPool; // Get pool from app locals
    
    // AI Worker Pool check - only manual mode supported (word mode commented out)
    if (!aiWorkerPool) {
        log.warn(`AI Worker Pool not found for ${uploadId}, using fallback`);
    }
    
    transcribeVideo(videoPath, subtitlePreference, aiWorkerPool)
      .then(async (subtitles) => {
        if (!subtitles) {
          log.error(`No subtitles generated for ${uploadId}`);
          throw new Error('Keine Untertitel generiert');
        }
        log.info(`Transcription complete for ${uploadId}`);
        
        // Markiere Upload als verarbeitet für intelligentes Cleanup
        markUploadAsProcessed(uploadId);
        
        // Setze 'complete' status in Redis
        const finalStatus = JSON.stringify({ status: 'complete', data: subtitles });
        try {
            await redisClient.set(jobKey, finalStatus, { EX: 60 * 60 * 24 });
            log.debug(`Redis status 'complete' set for ${jobKey}`);
        } catch (redisError) {
             log.error(`Redis error setting 'complete' status: ${redisError.message}`);
        }
      })
      .catch(async (error) => {
        log.error(`Async processing error for ${uploadId}: ${error.message}`);
        
        // Bei Fehlern sofortiges Cleanup planen
        scheduleImmediateCleanup(uploadId, 'transcription error');
        
        // Setze 'error' status in Redis
        const errorStatus = JSON.stringify({ status: 'error', data: error.message || 'Fehler bei der Verarbeitung.' });
         try {
            await redisClient.set(jobKey, errorStatus, { EX: 60 * 60 * 24 });
            log.debug(`Redis status 'error' set for ${jobKey}`);
        } catch (redisError) {
             log.error(`Redis error setting 'error' status: ${redisError.message}`);
        }
      });

    // Respond immediately that processing has started
    res.status(202).json({ 
        success: true, 
        status: 'processing', 
        message: 'Video-Verarbeitung gestartet.',
        uploadId: uploadId 
    });

  } catch (error) {
    log.error(`Critical error starting processing for ${uploadId}: ${error.message}`);
     // Setze Fehlerstatus in Redis auch bei schwerwiegendem Startfehler
    const criticalErrorStatus = JSON.stringify({ status: 'error', data: error.message || 'Fehler beim Start der Verarbeitung.' });
     try {
        // Prüfe, ob der Key schon existiert, bevor überschrieben wird (optional, aber sicherheitshalber)
        // await redisClient.set(jobKey, criticalErrorStatus, { EX: 60 * 60 * 24, NX: true }); // NX = Nur setzen, wenn Key nicht existiert
        await redisClient.set(jobKey, criticalErrorStatus, { EX: 60 * 60 * 24 });
        log.debug(`Redis status 'critical error' set for ${jobKey}`);
    } catch (redisError) {
         log.error(`Redis error setting 'critical error' status: ${redisError.message}`);
    }
    // Ensure response is sent even if error occurs before async part
     if (!res.headersSent) {
        res.status(500).json({
            error: 'Fehler beim Start der Verarbeitung des Videos',
            details: error.message
        });
     }
     // Cleanup if file was identified but process start failed
     // if (videoPath) { await cleanupFiles(videoPath); } // Cleanup-Strategie überdenken
  } 
});

// Route to get processing status and results
router.get('/result/:uploadId', async (req, res) => {
    const { uploadId } = req.params;
      const { 
    subtitlePreference = 'manual', // Mode: only 'manual' supported (word mode commented out)
    stylePreference = 'standard',
    heightPreference = 'standard' // Height positioning: 'standard' or 'tief'
  } = req.query; // Get mode, style, and height preferences from query params
    const jobKey = `job:${uploadId}:${subtitlePreference}:${stylePreference}:${heightPreference}`;
    let jobDataString;

    try {
        jobDataString = await redisClient.get(jobKey);
        log.debug(`Redis status queried for ${jobKey}`);
    } catch (redisError) {
        log.error(`Redis error fetching status for ${jobKey}: ${redisError.message}`);
        return res.status(500).json({ status: 'error', error: 'Interner Serverfehler beim Abrufen des Job-Status.' });
    }

    if (!jobDataString) {
        return res.status(404).json({ status: 'not_found', error: 'Kein Job für diese ID gefunden.' });
    }

    try {
        const job = JSON.parse(jobDataString);
        log.debug(`Job status for ${jobKey}: ${job.status}`);

        // Get compression status for additional info
        const compressionStatus = await getCompressionStatus(uploadId);

        switch (job.status) {
            case 'processing':
                return res.status(200).json({ 
                    status: 'processing',
                    compression: compressionStatus
                });
            case 'complete':
                return res.status(200).json({ 
                    status: 'complete', 
                    subtitles: job.data,
                    compression: compressionStatus
                });
            case 'error':
                return res.status(200).json({ 
                    status: 'error', 
                    error: job.data,
                    compression: compressionStatus
                });
            default:
                log.error(`Unknown job status for ${jobKey}: ${job.status}`);
                return res.status(500).json({ status: 'unknown', error: 'Unbekannter Job-Status.' });
        }
    } catch (parseError) {
        log.error(`Error parsing Redis data for ${jobKey}: ${parseError.message}`);
        return res.status(500).json({ status: 'error', error: 'Interner Fehler beim Lesen des Job-Status.' });
    }
});

// Route to get export progress
router.get('/export-progress/:exportToken', async (req, res) => {
    const { exportToken } = req.params; // Changed from uploadId to exportToken
    
    try {
        // Use exportToken to fetch progress from Redis
        const progressData = await redisClient.get(`export:${exportToken}`); 
        
        if (!progressData) {
            return res.status(404).json({ status: 'not_found' });
        }
        
        const progress = JSON.parse(progressData);
        return res.status(200).json(progress);
        
    } catch (error) {
        log.error(`Error fetching export progress for token ${exportToken}: ${error.message}`);
        return res.status(500).json({ status: 'error', error: 'Fehler beim Abrufen des Progress' });
    }
});

// Route to get compression status
router.get('/compression-status/:uploadId', async (req, res) => {
    const { uploadId } = req.params;
    
    try {
        const compressionStatus = await getCompressionStatus(uploadId);
        return res.status(200).json(compressionStatus);
    } catch (error) {
        log.error(`Error fetching compression status for ${uploadId}: ${error.message}`);
        return res.status(500).json({ status: 'error', error: 'Fehler beim Abrufen des Compression-Status' });
    }
});

// Route for cleanup of uploaded files
router.delete('/cleanup/:uploadId', async (req, res) => {
  const { uploadId } = req.params;
  
  if (!uploadId) {
    return res.status(400).json({ error: 'Upload-ID fehlt' });
  }

  try {
    log.debug(`Manual cleanup requested for ${uploadId}`);
    scheduleImmediateCleanup(uploadId, 'manual cleanup request');
    res.status(200).json({ success: true, message: 'Cleanup erfolgreich geplant' });
  } catch (error) {
    log.error(`Cleanup error for ${uploadId}: ${error.message}`);
    res.status(500).json({ error: 'Fehler beim Cleanup', details: error.message });
  }
});

// Route to generate download token (Phase 1: Direct URL Download)
router.post('/export-token', async (req, res) => {
  try {
    const result = await generateDownloadToken(req.body);
    res.json({ 
      success: true, 
      ...result
    });
  } catch (error) {
    log.error(`Export token error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Route for direct download via token (Phase 1: Direct URL Download)
router.get('/download/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    await processDirectDownload(token, res);
  } catch (error) {
    log.error(`Direct download error for token ${token}: ${error.message}`);
    if (!res.headersSent) {
      res.status(error.message.includes('ungültig') ? 404 : 500).json({ 
        error: error.message 
      });
    }
  }
});

// Route for chunked download (Phase 3: Chunked Downloads for Large Files)
router.get('/download-chunk/:uploadId/:chunkIndex', async (req, res) => {
  const { uploadId, chunkIndex } = req.params;
  
  try {
    await processChunkedDownload(uploadId, parseInt(chunkIndex), res);
  } catch (error) {
    log.error(`Chunked download error for ${uploadId} chunk ${chunkIndex}: ${error.message}`);
    if (!res.headersSent) {
      res.status(404).json({ error: error.message });
    }
  }
});

// Route for downloading completed exports
router.get('/export-download/:exportToken', async (req, res) => {
  const { exportToken } = req.params;
  
  try {
    // Get export completion data from Redis
    const exportDataString = await redisClient.get(`export:${exportToken}`);
    
    if (!exportDataString) {
      return res.status(404).json({ error: 'Export token not found or expired' });
    }
    
    const exportData = JSON.parse(exportDataString);
    
    if (exportData.status !== 'complete') {
      return res.status(400).json({ 
        error: 'Export not complete', 
        status: exportData.status,
        progress: exportData.progress 
      });
    }
    
    const { outputPath, originalFilename } = exportData;
    
    if (!outputPath || !await checkFileExists(outputPath)) {
      return res.status(404).json({ error: 'Export file not found' });
    }
    
    // Get file stats
    const stats = await fsPromises.stat(outputPath);
    const fileSize = stats.size;
    
    // Prepare filename
    const sanitizedFilename = path.basename(originalFilename, path.extname(originalFilename))
      .replace(/[^a-zA-Z0-9_-]/g, '_') + '_gruenerator.mp4';
    
    // Set response headers
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedFilename}`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    log.info(`Streaming export: ${exportToken} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
    
    // Stream the file
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    
    // Clean up after download completes
    fileStream.on('end', async () => {
      setTimeout(async () => {
        try {
          await cleanupFiles(null, outputPath);
          await redisClient.del(`export:${exportToken}`);
          log.debug(`Cleaned up export: ${exportToken}`);
        } catch (cleanupError) {
          log.warn(`Cleanup failed for ${exportToken}: ${cleanupError.message}`);
        }
      }, 2000);
    });

    fileStream.on('error', (error) => {
      log.error(`Stream error for ${exportToken}: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming export file' });
      }
    });
    
  } catch (error) {
    log.error(`Export download error for ${exportToken}: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Route zum Herunterladen des fertigen Videos (Legacy - kept for backward compatibility)
router.post('/export', async (req, res) => {
  // Expect uploadId, subtitles, subtitlePreference, stylePreference, locale, and maxResolution in body
  const {
    uploadId,
    subtitles,
    subtitlePreference = 'manual', // Mode: only 'manual' supported (word mode commented out)
    stylePreference = 'standard', // Style preference parameter
    heightPreference = 'standard', // Height positioning: 'standard' or 'tief'
    locale = 'de-DE', // User locale for Austria-specific styling
    maxResolution = null, // Max output resolution (e.g., 1080 for Instagram compatibility, null for full quality)
    projectId = null, // Optional: project ID for saving subtitled video
    userId = null // Optional: user ID for saving subtitled video
  } = req.body; 
  let inputPath = null;
  let outputPath = null;
  let originalFilename = 'video.mp4'; // Default filename
  const exportToken = uuidv4(); // Generate a unique token for this export operation

  if (!subtitles) {
    return res.status(400).json({ error: 'Untertitel werden benötigt' });
  }

  log.debug(`Export starting: style=${stylePreference}, height=${heightPreference}, locale=${locale}, projectId=${projectId}`);

  try {
    // Try to get video from project first if projectId and userId are provided
    if (projectId && userId) {
      try {
        const { getSubtitlerProjectService } = await import('../../services/subtitlerProjectService.js');
        const projectService = getSubtitlerProjectService();
        await projectService.ensureInitialized();

        const project = await projectService.getProject(userId, projectId);
        if (project && project.video_path) {
          inputPath = projectService.getVideoPath(project.video_path);
          originalFilename = project.video_filename || 'video.mp4';
          log.debug(`Using project video path: ${inputPath}`);
        }
      } catch (projectError) {
        log.warn(`Could not load project video, falling back to uploadId: ${projectError.message}`);
      }
    }

    // Fall back to uploadId if no project video found
    if (!inputPath && uploadId) {
      inputPath = getFilePathFromUploadId(uploadId);
      originalFilename = `video_${uploadId}.mp4`;
    }

    if (!inputPath) {
      return res.status(400).json({ error: 'Upload-ID oder Projekt-ID wird benötigt' });
    }

    const fileExists = await checkFileExists(inputPath);
    if (!fileExists) {
      log.error(`Video file for export not found: ${inputPath}`);
      return res.status(404).json({ error: 'Zugehörige Video-Datei für Export nicht gefunden.' });
    }


    await checkFont(); // Font check remains the same
    const metadata = await getVideoMetadata(inputPath); // Get metadata from the actual file
    
    const fileStats = await fsPromises.stat(inputPath);
    log.info(`Export: ${uploadId}, ${(fileStats.size / 1024 / 1024).toFixed(2)}MB, ${metadata.width}x${metadata.height}`);
    
    const outputDir = path.join(__dirname, '../../uploads/exports');
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    // Use original filename (or fallback) for output
    const outputBaseName = path.basename(originalFilename, path.extname(originalFilename));
    outputPath = path.join(outputDir, `${outputBaseName}_${Date.now()}${path.extname(originalFilename)}`);

    // Intelligent font size calculation for short subtitle segments
    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const totalPixels = metadata.width * metadata.height;
    
    // Increased base values for better readability of short texts
    let minFontSize, maxFontSize, basePercentage;
    
    if (referenceDimension >= 2160) { // 4K and higher
      minFontSize = 80;  // +20px for short texts
      maxFontSize = 180; // +40px for better visibility
      basePercentage = isVertical ? 0.070 : 0.065; // +1.5% / +1.5%
    } else if (referenceDimension >= 1440) { // 2K/1440p
      minFontSize = 60;  // +15px
      maxFontSize = 140; // +40px
      basePercentage = isVertical ? 0.065 : 0.060; // +1.5% / +1.5%
    } else if (referenceDimension >= 1080) { // FullHD
      minFontSize = 40;  // Reduced by 10%
      maxFontSize = 90; // Reduced by 10%
      basePercentage = isVertical ? 0.054 : 0.0495; // Reduced by 10%
    } else if (referenceDimension >= 720) { // HD
      minFontSize = 35;  // +10px
      maxFontSize = 70;  // +15px
      basePercentage = isVertical ? 0.055 : 0.050; // +1.5% / +1.5%
    } else { // SD and smaller
      minFontSize = 32;  // Increased from 24 for better readability on small screens
      maxFontSize = 65;  // Increased from 50 for better visibility
      basePercentage = isVertical ? 0.065 : 0.060; // Increased from 0.050/0.045 for better proportion
    }
    
    // Logarithmic adjustment for very high resolutions (amplified)
    const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1; // Increased from 0.1 to 0.15
    const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4); // Max 40% increase (instead of 30%)
    
    const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(referenceDimension * adjustedPercentage)));

    // Calculate line spacing with a hybrid approach
    const minSpacing = 40; // Minimum spacing in pixels
    const maxSpacing = fontSize * 1.25;
    const spacing = Math.max(minSpacing, Math.min(maxSpacing, fontSize * (1.5 + (1 - fontSize/48))));

    // Process subtitle segments
    
    // First pass: Extract raw data and sort
    const preliminarySegments = subtitles
      .split('\n\n')
      .map((block, index) => {
        const lines = block.trim().split('\n');
        if (lines.length < 2) {
          // console.warn(`[subtitlerController] Skipping invalid block ${index}:`, block); // Keep this commented unless very verbose debugging is needed
          return null;
        }
        
        const timeLine = lines[0].trim();
        const timeMatch = timeLine.match(/^(\d{1,2}):(\d{2})\.(\d)\s*-\s*(\d{1,2}):(\d{2})\.(\d)$/);
        if (!timeMatch) {
          // console.warn(`[subtitlerController] Invalid time format in block ${index}:`, timeLine); // Keep this commented
          return null;
        }

        let startMin = parseInt(timeMatch[1]);
        let startSec = parseInt(timeMatch[2]);
        let startFrac = parseInt(timeMatch[3]);
        let endMin = parseInt(timeMatch[4]);
        let endSec = parseInt(timeMatch[5]);
        let endFrac = parseInt(timeMatch[6]);

        // Handle minute overflow for fractional seconds (shouldn't happen with new format)
        if (startSec >= 60) {
          startMin += Math.floor(startSec / 60);
          startSec = startSec % 60;
        }
        if (endSec >= 60) {
          endMin += Math.floor(endSec / 60);
          endSec = endSec % 60;
        }

        // Convert to precise floating point seconds
        const startTime = startMin * 60 + startSec + (startFrac / 10);
        const endTime = endMin * 60 + endSec + (endFrac / 10);

        if (startTime >= endTime) {
          log.warn(`Invalid time range in block ${index}: ${startTime} >= ${endTime}`);
          return null;
        }

        const rawText = lines.slice(1).join(' ').trim();
        if (!rawText) {
          return null;
        }

        return {
          startTime,
          endTime,
          rawText
        };
      })
      .filter(Boolean) // Remove nulls from invalid blocks
      .sort((a, b) => a.startTime - b.startTime); // Sort by startTime

    if (preliminarySegments.length === 0) {
      throw new Error('Keine gültigen vorläufigen Untertitel-Segmente gefunden');
    }

    // ---- Start: Calculate average segment length and enhanced scale factor based on rawText ----
    let totalChars = 0;
    let totalWords = 0;
    preliminarySegments.forEach(segment => {
      totalChars += segment.rawText.length;
      totalWords += segment.rawText.split(' ').length;
    });
    const avgLength = preliminarySegments.length > 0 ? totalChars / preliminarySegments.length : 30;
    const avgWords = preliminarySegments.length > 0 ? totalWords / preliminarySegments.length : 5;

    // ---- Second pass to process text and create final segments ----
    const segments = preliminarySegments.map((pSegment) => ({
      startTime: pSegment.startTime,
      endTime: pSegment.endTime,
      text: pSegment.rawText
    }));

    if (segments.length === 0) {
      throw new Error('Keine finalen Untertitel-Segmente nach der Verarbeitung gefunden');
    }

    log.debug(`Parsed ${segments.length} segments`);

    const calculateScaleFactor = (avgChars, avgWords) => {
        // Verstärkte Skalierung für kurze Texte (typisch für Untertitel)
        const shortCharThreshold = 20;  // Reduziert von 15
        const longCharThreshold = 40;   // Reduziert von 45
        const shortWordThreshold = 3;   // Sehr kurze Segmente
        const longWordThreshold = 7;    // Längere Segmente
        
        // Basis-Faktoren für Textlänge (verstärkt)
        let charFactor;
        if (avgChars <= shortCharThreshold) {
            charFactor = 1.35; // Erhöht von 1.15 auf 1.35 für sehr kurze Texte
        } else if (avgChars >= longCharThreshold) {
            charFactor = 0.95; // Leicht reduziert für lange Texte
        } else {
            // Linear interpolation
            const range = longCharThreshold - shortCharThreshold;
            const position = avgChars - shortCharThreshold;
            charFactor = 1.35 - ((1.35 - 0.95) * (position / range));
        }
        
        // Zusätzlicher Wort-basierter Faktor
        let wordFactor;
        if (avgWords <= shortWordThreshold) {
            wordFactor = 1.25; // Bonus für sehr wenige Wörter
        } else if (avgWords >= longWordThreshold) {
            wordFactor = 0.95; // Leichte Reduktion für viele Wörter
        } else {
            const range = longWordThreshold - shortWordThreshold;
            const position = avgWords - shortWordThreshold;
            wordFactor = 1.25 - ((1.25 - 0.95) * (position / range));
        }
        
        // Kombiniere beide Faktoren (gewichtet)
        return (charFactor * 0.7) + (wordFactor * 0.3);
    };

    const scaleFactor = calculateScaleFactor(avgLength, avgWords);

    // Apply scale factor and clamp
    const finalFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(fontSize * scaleFactor)));
    // Also scale maxSpacing when scaling up, keep minSpacing fixed
    const scaledMaxSpacing = maxSpacing * (scaleFactor > 1 ? scaleFactor : 1);
    const finalSpacing = Math.max(minSpacing, Math.min(scaledMaxSpacing, Math.floor(spacing * scaleFactor)));

    log.debug(`Font: ${finalFontSize}px, spacing: ${finalSpacing}px`);

    // Updated cache key to include stylePreference, heightPreference, and locale
    const cacheKey = `${uploadId}_${subtitlePreference}_${stylePreference}_${heightPreference}_${locale}_${metadata.width}x${metadata.height}`;
    
    // Try to generate ASS subtitles with the selected style
    let assFilePath = null;
    let tempFontPath = null;

    try {
      // Check for cached ASS content first (updated with style preference)
      let assContent = await assService.getCachedAssContent(cacheKey);
      
      if (!assContent) {
        // Generate new ASS content with optimized styling and mode-specific positioning
        const styleOptions = {
          fontSize: Math.floor(finalFontSize / 2), // ASS uses different font size scale than drawtext - divide by 2 for visual equivalency
          marginL: 10, // Reduzierte Seitenränder
          marginR: 10,
          // Mode and height-specific positioning
          marginV: subtitlePreference === 'word' 
            ? Math.floor(metadata.height * 0.50) // Word mode: center positioning (50% from bottom)
            : (heightPreference === 'tief' 
                ? Math.floor(metadata.height * 0.20) // Manual mode + tief: deeper positioning (20% from bottom)
                : Math.floor(metadata.height * 0.33)), // Manual mode + standard: Instagram Reels positioning (33% from bottom)
          alignment: subtitlePreference === 'word' 
            ? 5 // Word mode: middle center alignment (TikTok style)
            : 2 // Manual mode: bottom center alignment
          // Note: outline, borderStyle, backColor, primaryColor are handled by style presets
        };
        
        // Pass style preference and locale to ASS service
        const assResult = assService.generateAssContent(
          segments,
          metadata,
          styleOptions,
          subtitlePreference,
          stylePreference,
          locale // Add locale parameter for Austria-specific styling
        );
        assContent = assResult.content;

        // Cache the generated content (includes style and locale in cache key)
        await assService.cacheAssContent(cacheKey, assContent);
      }
      
      // Create temporary ASS file
      assFilePath = await assService.createTempAssFile(assContent, uploadId);

      // Get the effective style (may be mapped for Austrian users)
      const effectiveStyle = assService.mapStyleForLocale(stylePreference, locale);

      // Copy the correct font to temp directory based on effective style
      const sourceFontPath = assService.getFontPathForStyle(effectiveStyle);
      const fontFilename = path.basename(sourceFontPath);
      tempFontPath = path.join(path.dirname(assFilePath), fontFilename);
      try {
        await fsPromises.copyFile(sourceFontPath, tempFontPath);
        log.debug(`Font copied to temp: ${fontFilename}`);
      } catch (fontCopyError) {
        log.warn(`Font copy failed, using fallback: ${fontCopyError.message}`);
        tempFontPath = null;
      }

      log.debug(`ASS: mode=${subtitlePreference}, style=${effectiveStyle}, ${segments.length} segments`);

    } catch (assError) {
      log.error(`ASS generation error: ${assError.message}`);
      assFilePath = null; // Proceed without subtitles
    }

    // Return JSON response immediately to enable progress polling
    res.status(202).json({
      status: 'exporting',
      exportToken: exportToken,
      message: 'Export started. Use the token to poll for progress.'
    });

    // Start background processing after response is sent
    const backgroundParams = {
      inputPath,
      outputPath,
      segments,
      metadata,
      fileStats,
      exportToken,
      subtitlePreference,
      stylePreference,
      heightPreference,
      locale,
      maxResolution,
      finalFontSize,
      uploadId,
      originalFilename,
      assFilePath,   // Pass pre-generated ASS file to avoid regeneration
      tempFontPath,  // Pass pre-copied font path
      projectId,     // Optional: for saving subtitled video to project
      userId         // Optional: for saving subtitled video to project
    };

    // Start background processing (fire and forget)
    processVideoExportInBackground(backgroundParams)
      .catch(error => {
        log.error(`Background processing failed: ${error.message}`);
        // Error handling is done inside the background function
      });

  } catch (error) {
    log.error(`Export error: ${error.message}`);
    await cleanupFiles(null, outputPath); // Only cleanup output file on error

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Fehler beim Exportieren des Videos',
        details: error.message
      });
    }
  }
});

// Background processing function for video export
async function processVideoExportInBackground(params) {
  const {
    inputPath,
    outputPath,
    segments,
    metadata,
    fileStats,
    exportToken,
    subtitlePreference,
    stylePreference,
    heightPreference,
    locale = 'de-DE',
    maxResolution = null,
    finalFontSize,
    uploadId,
    originalFilename,
    assFilePath: preGeneratedAssPath = null,   // Pre-generated ASS file from export endpoint
    tempFontPath: preGeneratedFontPath = null, // Pre-copied font path from export endpoint
    projectId = null,  // Optional: project ID for saving subtitled video
    userId = null      // Optional: user ID for saving subtitled video
  } = params;

  try {
    log.debug(`Background export starting for token: ${exportToken}`);
    
    // Set initial progress
    await redisClient.set(`export:${exportToken}`, JSON.stringify({
      status: 'exporting',
      progress: 0,
      message: 'Starting video processing...'
    }), { EX: 60 * 60 });

    // Get reference dimension for quality settings
    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const fileSizeMB = fileStats.size / 1024 / 1024;

    // Use pre-generated ASS file if available, otherwise generate new one
    let assFilePath = preGeneratedAssPath;
    let tempFontPath = preGeneratedFontPath;

    if (!assFilePath) {
      // Only generate if not passed from export endpoint (fallback)
      log.debug('No pre-generated ASS file, generating in background');
      const cacheKey = `${uploadId}_${subtitlePreference}_${stylePreference}_${heightPreference}_${locale}_${metadata.width}x${metadata.height}`;

      try {
        let assContent = await assService.getCachedAssContent(cacheKey);

        if (!assContent) {
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

          const assResult = assService.generateAssContent(
            segments,
            metadata,
            styleOptions,
            subtitlePreference,
            stylePreference,
            locale
          );
          assContent = assResult.content;

          await assService.cacheAssContent(cacheKey, assContent);
        }

        assFilePath = await assService.createTempAssFile(assContent, uploadId);

        const effectiveStyle = assService.mapStyleForLocale(stylePreference, locale);
        const sourceFontPath = assService.getFontPathForStyle(effectiveStyle);
        const fontFilename = path.basename(sourceFontPath);
        tempFontPath = path.join(path.dirname(assFilePath), fontFilename);
        try {
          await fsPromises.copyFile(sourceFontPath, tempFontPath);
        } catch (fontCopyError) {
          log.warn(`Font copy failed: ${fontCopyError.message}`);
          tempFontPath = null;
        }

      } catch (assError) {
        log.error(`ASS generation error: ${assError.message}`);
        assFilePath = null;
      }
    } else {
      log.debug('Using pre-generated ASS file from export endpoint');
    }

    // Detect hardware acceleration availability
    const useHwAccel = await hwaccel.detectVaapi();

    // FFmpeg processing - wrapped in pool to limit concurrent processes
    await ffmpegPool.run(async () => {
      await new Promise((resolve, reject) => {
        const command = ffmpeg(inputPath)
          .setDuration(parseFloat(metadata.duration) || 0);

      // Quality settings from centralized config
      const isLargeFile = fileSizeMB > 200;
      const qualitySettings = hwaccel.getQualitySettings(referenceDimension, isLargeFile);
      const { crf, preset } = qualitySettings;
      const tune = 'film';

      if (isLargeFile) {
        log.debug(`Large file (${fileSizeMB.toFixed(1)}MB), using optimized settings: CRF ${crf}, preset ${preset}`);
      }

      // Audio settings
      let audioCodec, audioBitrate;
      const originalAudioCodec = metadata.originalFormat?.audioCodec;
      const originalAudioBitrate = metadata.originalFormat?.audioBitrate;

      if (originalAudioCodec === 'aac' && originalAudioBitrate && originalAudioBitrate >= 128) {
        audioCodec = 'copy';
        audioBitrate = null;
      } else {
        audioCodec = 'aac';
        audioBitrate = qualitySettings.audioBitrate;
      }

      // Video codec and output options based on hardware availability
      const is4K = referenceDimension >= 2160;
      const isHevcSource = metadata.originalFormat?.codec === 'hevc';
      let videoCodec;
      let outputOptions;

      if (useHwAccel) {
        videoCodec = hwaccel.getVaapiEncoder(is4K, isHevcSource);
        const qp = hwaccel.crfToQp(crf);

        command.inputOptions(hwaccel.getVaapiInputOptions());

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
          ...(tune ? ['-tune', tune] : []),
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

      command.outputOptions(outputOptions);

      // Build video filters
      let scaleFilter = null;
      const isVertical = metadata.width < metadata.height;
      const qualityDimension = isVertical ? metadata.width : metadata.height;
      if (maxResolution && qualityDimension > maxResolution) {
        const aspectRatio = metadata.width / metadata.height;
        let targetWidth, targetHeight;
        if (isVertical) {
          // Vertical: scale width to maxResolution, calculate height
          targetWidth = maxResolution;
          targetHeight = Math.round(targetWidth / aspectRatio);
        } else {
          // Horizontal: scale height to maxResolution, calculate width
          targetHeight = maxResolution;
          targetWidth = Math.round(targetHeight * aspectRatio);
        }
        const finalWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        const finalHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;
        scaleFilter = `scale=${finalWidth}:${finalHeight}`;
        log.info(`Scaling video from ${metadata.width}x${metadata.height} to ${finalWidth}x${finalHeight} (maxResolution: ${maxResolution})`);
      }

      if (useHwAccel) {
        const fontDir = assFilePath ? path.dirname(tempFontPath) : null;
        const filterChain = hwaccel.getSubtitleFilterChain(assFilePath, fontDir, scaleFilter);
        command.videoFilters([filterChain]);
      } else {
        const videoFilters = [];
        if (scaleFilter) {
          videoFilters.push(scaleFilter);
        }
        if (assFilePath) {
          const fontDir = path.dirname(tempFontPath);
          videoFilters.push(`subtitles=${assFilePath}:fontsdir=${fontDir}`);
        }
        if (videoFilters.length > 0) {
          command.videoFilters(videoFilters);
        }
      }

      command
        .on('start', () => {
          log.debug('FFmpeg processing started');
        })
        .on('progress', async (progress) => {
          const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
          
          // Store progress in Redis
          const progressData = {
            status: 'exporting',
            progress: progressPercent,
            timeRemaining: progress.timemark
          };
          try {
            await redisClient.set(`export:${exportToken}`, JSON.stringify(progressData), { EX: 60 * 60 });
          } catch (redisError) {
            log.warn(`Redis progress update error: ${redisError.message}`);
          }
        })
        .on('error', (err) => {
          log.error(`FFmpeg error: ${err.message}`);
          // Store error status in Redis
          redisClient.set(`export:${exportToken}`, JSON.stringify({
            status: 'error',
            error: err.message || 'FFmpeg processing failed'
          }), { EX: 60 * 60 }).catch(redisErr => log.warn(`Redis error storage failed: ${redisErr.message}`));
          
          // Cleanup ASS files
          if (assFilePath) {
            assService.cleanupTempFile(assFilePath).catch(cleanupErr => log.warn(`ASS cleanup failed: ${cleanupErr.message}`));
            if (tempFontPath) {
              fsPromises.unlink(tempFontPath).catch(fontErr => log.warn(`Font cleanup failed: ${fontErr.message}`));
            }
          }
          reject(err);
        })
        .on('end', async () => {
          log.info(`FFmpeg processing complete for ${exportToken}`);

          // If projectId and userId are provided, save subtitled video to project
          if (projectId && userId) {
            try {
              const { getSubtitlerProjectService } = await import('../../services/subtitlerProjectService.js');
              const projectService = getSubtitlerProjectService();
              await projectService.ensureInitialized();

              // Get project to check for existing subtitled video
              const project = await projectService.getProject(userId, projectId);

              // Define persistent path
              const projectDir = path.join(__dirname, '../../uploads/subtitler-projects', userId, projectId);
              const subtitledFilename = `subtitled_${Date.now()}.mp4`;
              const persistentPath = path.join(projectDir, subtitledFilename);
              const relativeSubtitledPath = `${userId}/${projectId}/${subtitledFilename}`;

              // Ensure directory exists
              await fsPromises.mkdir(projectDir, { recursive: true });

              // Clean up old subtitled video if exists
              if (project.subtitled_video_path) {
                const oldPath = path.join(__dirname, '../../uploads/subtitler-projects', project.subtitled_video_path);
                await fsPromises.unlink(oldPath).catch(() => {});
              }

              // Copy the exported video to persistent storage
              await fsPromises.copyFile(outputPath, persistentPath);

              // Update database with new subtitled video path
              await projectService.updateSubtitledVideoPath(userId, projectId, relativeSubtitledPath);

              log.info(`Saved subtitled video for project ${projectId}: ${relativeSubtitledPath}`);
            } catch (saveError) {
              log.warn(`Failed to save subtitled video for project: ${saveError.message}`);
            }
          }

          // Store completion status with file path in Redis
          try {
            const completionData = {
              status: 'complete',
              progress: 100,
              outputPath: outputPath,
              originalFilename: originalFilename
            };
            await redisClient.set(`export:${exportToken}`, JSON.stringify(completionData), { EX: 60 * 60 });
          } catch (redisError) {
            log.warn(`Redis completion status storage failed: ${redisError.message}`);
          }

          // Cleanup ASS files
          if (assFilePath) {
            await assService.cleanupTempFile(assFilePath).catch(cleanupErr => log.warn(`ASS cleanup failed: ${cleanupErr.message}`));
            if (tempFontPath) {
              await fsPromises.unlink(tempFontPath).catch(fontErr => log.warn(`Font cleanup failed: ${fontErr.message}`));
            }
          }
          resolve();
        });

      command.save(outputPath);
      });
    }, `export-${exportToken}`);

  } catch (error) {
    log.error(`Background processing failed for ${exportToken}: ${error.message}`);
    
    // Store error status in Redis
    try {
      await redisClient.set(`export:${exportToken}`, JSON.stringify({
        status: 'error',
        error: error.message || 'Background processing failed'
      }), { EX: 60 * 60 });
    } catch (redisError) {
      log.warn(`Redis error storage failed: ${redisError.message}`);
    }
  }
}

// Route for AI subtitle correction
router.post('/correct-subtitles', async (req, res) => {
  const { segments } = req.body;

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    log.error('No segments provided for correction');
    return res.status(400).json({ error: 'Keine Untertitel-Segmente zum Korrigieren.' });
  }

  log.debug(`[correct-subtitles] Processing ${segments.length} segments`);

  try {
    const aiWorkerPool = req.app.locals.aiWorkerPool;

    if (!aiWorkerPool) {
      log.error('[correct-subtitles] AI Worker Pool not available');
      return res.status(500).json({ error: 'AI-Service nicht verfügbar.' });
    }

    const result = await correctSubtitlesViaAI(segments, aiWorkerPool);

    log.info(`[correct-subtitles] Corrections found: ${result.hasCorrections}, count: ${result.corrections?.length || 0}`);

    return res.json({
      corrections: result.corrections,
      hasCorrections: result.hasCorrections
    });

  } catch (error) {
    log.error(`[correct-subtitles] Error: ${error.message}`);
    return res.status(500).json({
      error: 'Fehler bei der KI-Korrektur',
      details: error.message
    });
  }
});

module.exports = router; 