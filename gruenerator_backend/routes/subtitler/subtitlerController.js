const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const ffmpeg = require('fluent-ffmpeg');
const { getVideoMetadata, cleanupFiles } = require('./services/videoUploadService');
const { transcribeVideo } = require('./services/transcriptionService');
const { getFilePathFromUploadId, checkFileExists, markUploadAsProcessed, scheduleImmediateCleanup } = require('./services/tusService');
const redisClient = require('../../utils/redisClient'); // Import Redis client
const { v4: uuidv4 } = require('uuid'); // Import uuid
const AssSubtitleService = require('./services/assSubtitleService'); // Import ASS service

// Font configuration
const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneType.ttf');

// Create ASS service instance
const assService = new AssSubtitleService();

// Check if the font exists (optional for ASS - will fallback to system fonts)
async function checkFont() {
  try {
    await fsPromises.access(FONT_PATH);
    console.log('GrueneType Font found for ASS subtitles:', FONT_PATH);
  } catch (err) {
    console.warn('GrueneType Font not found, ASS will use system fallback:', err.message);
    // Don't throw error for ASS - it can handle font fallbacks
  }
}

// Route for video upload and processing
router.post('/process', async (req, res) => {
  console.log('=== SUBTITLER PROCESS START ===');
  const { uploadId, subtitlePreference = 'standard' } = req.body; // Expect uploadId and preference in request body, default to 'standard'
  let videoPath = null;

  if (!uploadId) {
    console.error('Keine Upload-ID im Request gefunden');
    return res.status(400).json({ error: 'Keine Upload-ID gefunden' });
  }

  console.log(`Verarbeitungsanfrage für Upload-ID erhalten: ${uploadId}`);
  console.log(`[subtitlerController] Request Body Debug:`, {
    uploadId,
    subtitlePreference,
    subtitlePreferenceType: typeof subtitlePreference,
    subtitlePreferenceLength: subtitlePreference?.length,
    rawBody: JSON.stringify(req.body)
  });

  // Create unique Redis key with subtitlePreference
  const jobKey = `job:${uploadId}:${subtitlePreference}`;
  
  // Set initial status in Redis with TTL (e.g., 24 hours)
  const initialStatus = JSON.stringify({ status: 'processing' });
  try {
      await redisClient.set(jobKey, initialStatus, { EX: 60 * 60 * 24 }); // EX for seconds (24h)
      console.log(`[Upstash Redis] Status 'processing' für ${jobKey} gesetzt.`);
  } catch (redisError) {
      console.error(`[Upstash Redis] Fehler beim Setzen des initialen Status für ${jobKey}:`, redisError);
      // Send error response to client if not already sent
       if (!res.headersSent) {
          return res.status(500).json({ error: 'Interner Serverfehler beim Start der Verarbeitung (Redis).' });
       }
       // Abort further processing if status could not be set
       return; 
  }

  try {
    videoPath = getFilePathFromUploadId(uploadId);
    console.log(`Abgeleiteter Videopfad: ${videoPath}`);

    const fileExists = await checkFileExists(videoPath);
    if (!fileExists) {
        console.error(`Video-Datei für Upload-ID nicht gefunden: ${uploadId} am Pfad: ${videoPath}`);
        
        // Plane sofortiges Cleanup für nicht existierende Dateien
        scheduleImmediateCleanup(uploadId, 'file not found');
        
        // Set error status in Redis
        const errorNotFoundStatus = JSON.stringify({ status: 'error', data: 'Zugehörige Video-Datei nicht gefunden.' });
        try {
            await redisClient.set(jobKey, errorNotFoundStatus, { EX: 60 * 60 * 24 }); 
        } catch (redisSetError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'file not found' Status für ${jobKey}:`, redisSetError);
        }
        return res.status(404).json({ error: 'Zugehörige Video-Datei nicht gefunden.' });
    }

    // Get file stats for logging
    const fileStats = await fsPromises.stat(videoPath);

    // Log basic file info
     console.log('Datei gefunden:', {
      uploadId: uploadId,
      pfad: videoPath,
      größe: `${(fileStats.size / 1024 / 1024).toFixed(2)}MB`
    });
    
    // Get metadata for logging (optional)
    try {
        const metadata = await getVideoMetadata(videoPath);
        console.log('Video Metadaten:', metadata);
    } catch (metaError) {
        console.warn('Konnte Metadaten nicht lesen:', metaError.message);
    }

    // Subtitle preference is logged
    console.log(`Untertitel Präferenz: ${subtitlePreference}`);

    console.log('Starte Transkription...');
    
    // Run transcription asynchronously
    // Corrected call: Pass subtitlePreference as the second parameter and the aiWorkerPool
    const aiWorkerPool = req.app.locals.aiWorkerPool; // Get pool from app locals
    if (!aiWorkerPool) {
        // Handle case where pool is not available
        console.error(`[subtitlerController] AI Worker Pool not found in app locals for ${uploadId}. Cannot generate short subtitles if requested.`);
        // Set error status or proceed without short subtitle capability
         const errorPoolStatus = JSON.stringify({ status: 'error', data: 'AI Worker Pool nicht konfiguriert.' });
         try {
            await redisClient.set(jobKey, errorPoolStatus, { EX: 60 * 60 * 24 }); 
            console.log(`[Upstash Redis] Status 'error' (AI Pool missing) für ${jobKey} gesetzt.`);
        } catch (redisError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'AI Pool missing' Status für ${jobKey}:`, redisError);
        }
         if (!res.headersSent) {
             return res.status(500).json({ error: 'Interner Konfigurationsfehler (AI Worker Pool).' });
         }
         return; // Stop further processing if pool is essential and missing
    }
    
    transcribeVideo(videoPath, subtitlePreference, aiWorkerPool) // Pass the pool
      .then(async (subtitles) => {
        if (!subtitles) {
          console.error(`Keine Untertitel generiert für Upload-ID: ${uploadId}`);
          throw new Error('Keine Untertitel generiert');
        }
        console.log(`Transkription erfolgreich für Upload-ID: ${uploadId}`);
        
        // Markiere Upload als verarbeitet für intelligentes Cleanup
        markUploadAsProcessed(uploadId);
        
        // Setze 'complete' status in Redis
        const finalStatus = JSON.stringify({ status: 'complete', data: subtitles });
        try {
            await redisClient.set(jobKey, finalStatus, { EX: 60 * 60 * 24 }); // TTL erneuern/setzen
            console.log(`[Upstash Redis] Status 'complete' für ${jobKey} gesetzt.`);
        } catch (redisError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'complete' Status für ${jobKey}:`, redisError);
             // Fehler loggen, aber fortfahren (Job bleibt evtl. 'processing')
        }
      })
      .catch(async (error) => {
        console.error(`Fehler bei der asynchronen Verarbeitung für Upload-ID ${uploadId}:`, error);
        
        // Bei Fehlern sofortiges Cleanup planen
        scheduleImmediateCleanup(uploadId, 'transcription error');
        
        // Setze 'error' status in Redis
        const errorStatus = JSON.stringify({ status: 'error', data: error.message || 'Fehler bei der Verarbeitung.' });
         try {
            await redisClient.set(jobKey, errorStatus, { EX: 60 * 60 * 24 }); // TTL für Fehler setzen
            console.log(`[Upstash Redis] Status 'error' für ${jobKey} gesetzt.`);
        } catch (redisError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'error' Status für ${jobKey}:`, redisError);
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
    console.error(`Schwerwiegender Fehler beim Start der Verarbeitung für ${uploadId}:`, error);
     // Setze Fehlerstatus in Redis auch bei schwerwiegendem Startfehler
    const criticalErrorStatus = JSON.stringify({ status: 'error', data: error.message || 'Fehler beim Start der Verarbeitung.' });
     try {
        // Prüfe, ob der Key schon existiert, bevor überschrieben wird (optional, aber sicherheitshalber)
        // await redisClient.set(jobKey, criticalErrorStatus, { EX: 60 * 60 * 24, NX: true }); // NX = Nur setzen, wenn Key nicht existiert
        await redisClient.set(jobKey, criticalErrorStatus, { EX: 60 * 60 * 24 }); // Überschreibt ggf. 'processing'
        console.log(`[Upstash Redis] Status 'error' (critical) für ${jobKey} gesetzt.`);
    } catch (redisError) {
         console.error(`[Upstash Redis] Fehler beim Setzen des 'critical error' Status für ${jobKey}:`, redisError);
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
    const { subtitlePreference = 'standard' } = req.query; // Get preference from query params
    const jobKey = `job:${uploadId}:${subtitlePreference}`;
    let jobDataString;

    try {
        jobDataString = await redisClient.get(jobKey);
        console.log(`[Upstash Redis] Status für ${jobKey} abgefragt. Rohdaten:`, jobDataString);
    } catch (redisError) {
        console.error(`[Upstash Redis] Fehler beim Abrufen des Status für ${jobKey}:`, redisError);
        return res.status(500).json({ status: 'error', error: 'Interner Serverfehler beim Abrufen des Job-Status.' });
    }

    if (!jobDataString) {
        return res.status(404).json({ status: 'not_found', error: 'Kein Job für diese ID gefunden.' });
    }

    try {
        const job = JSON.parse(jobDataString);
        console.log(`Statusabfrage für Job ${jobKey}: ${job.status}`);

        switch (job.status) {
            case 'processing':
                return res.status(200).json({ status: 'processing' });
            case 'complete':
                return res.status(200).json({ status: 'complete', subtitles: job.data });
            case 'error':
                return res.status(200).json({ status: 'error', error: job.data });
            default:
                console.error(`Unbekannter Job-Status in Redis für ${jobKey}:`, job.status);
                return res.status(500).json({ status: 'unknown', error: 'Unbekannter Job-Status.' });
        }
    } catch (parseError) {
        console.error(`Fehler beim Parsen der Redis-Daten für ${jobKey}:`, parseError, 'Daten:', jobDataString);
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
        console.error(`Fehler beim Abrufen des Export-Progress für Token ${exportToken}:`, error); // Log with exportToken
        return res.status(500).json({ status: 'error', error: 'Fehler beim Abrufen des Progress' });
    }
});

// Route for cleanup of uploaded files
router.delete('/cleanup/:uploadId', async (req, res) => {
  const { uploadId } = req.params;
  
  if (!uploadId) {
    return res.status(400).json({ error: 'Upload-ID fehlt' });
  }

  try {
    console.log(`[Cleanup] Manual cleanup requested for uploadId: ${uploadId}`);
    
    // Verwende die neue Cleanup-Funktion aus tusService
    scheduleImmediateCleanup(uploadId, 'manual cleanup request');
    
    res.status(200).json({ success: true, message: 'Cleanup erfolgreich geplant' });
  } catch (error) {
    console.error(`[Cleanup] Error during manual cleanup for ${uploadId}:`, error);
    res.status(500).json({ error: 'Fehler beim Cleanup', details: error.message });
  }
});

// Route zum Herunterladen des fertigen Videos
router.post('/export', async (req, res) => {
  // Expect uploadId and subtitles in body
  const { uploadId, subtitles } = req.body; 
  let inputPath = null;
  let outputPath = null;
  let originalFilename = 'video.mp4'; // Default filename
  const exportToken = uuidv4(); // Generate a unique token for this export operation

  if (!uploadId || !subtitles) {
    return res.status(400).json({ error: 'Upload-ID und Untertitel werden benötigt' });
  }

  try {
    inputPath = getFilePathFromUploadId(uploadId);
    const fileExists = await checkFileExists(inputPath);
     if (!fileExists) {
        console.error(`Video-Datei für Export nicht gefunden: ${uploadId} am Pfad: ${inputPath}`);
        return res.status(404).json({ error: 'Zugehörige Video-Datei für Export nicht gefunden.' });
    }
    
    // Try to get original filename from Tus metadata store (if implemented in tusService)
    // This is a placeholder - tusService needs to expose a way to get metadata
    // const tusMetadata = await getTusMetadata(uploadId); // Fictional function
    // if (tusMetadata?.originalName) {
    //     originalFilename = tusMetadata.originalName;
    // } else {
         // Fallback: Use uploadId or a generic name if metadata isn't available
         originalFilename = `video_${uploadId}.mp4`; // Example fallback
    // }


    await checkFont(); // Font check remains the same
    const metadata = await getVideoMetadata(inputPath); // Get metadata from the actual file
    
    // Log Export-Metadaten (using file size from stats)
    const fileStats = await fsPromises.stat(inputPath);
    console.log('Export-Info:', {
      uploadId: uploadId,
      inputGröße: `${(fileStats.size / 1024 / 1024).toFixed(2)}MB`,
      dimensionen: `${metadata.width}x${metadata.height}`,
      rotation: metadata.rotation || 'keine'
    });

    console.log('Starte Video-Export');
    console.log('Video-Datei:', inputPath);
    
    const outputDir = path.join(__dirname, '../../uploads/exports');
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    // Use original filename (or fallback) for output
    const outputBaseName = path.basename(originalFilename, path.extname(originalFilename));
    outputPath = path.join(outputDir, `subtitled_${outputBaseName}_${Date.now()}${path.extname(originalFilename)}`);
    console.log('Ausgabepfad:', outputPath);

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
      minFontSize = 45;  // +10px
      maxFontSize = 100; // +25px
      basePercentage = isVertical ? 0.060 : 0.055; // +1.5% / +1.3%
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
    console.log('[subtitlerController] Raw subtitles input (last 500 chars):', subtitles.slice(-500));
    
    // First pass: Extract raw data and sort
    const preliminarySegments = subtitles
      .split('\n\n')
      .map((block, index) => {
        const lines = block.trim().split('\n');
        if (lines.length < 2) {
          return null;
        }
        
        const timeLine = lines[0].trim();
        const timeMatch = timeLine.match(/^(\d{1,2}):(\d{2,3})\s*-\s*(\d{1,2}):(\d{2,3})$/);
        if (!timeMatch) {
          return null;
        }

        let startMin = parseInt(timeMatch[1]);
        let startSec = parseInt(timeMatch[2]);
        let endMin = parseInt(timeMatch[3]);
        let endSec = parseInt(timeMatch[4]);

        // DEBUG: Log time parsing for segments with potential issues
        const totalSegments = subtitles.split('\n\n').length;
        const isLastSegments = index >= totalSegments - 5; // Last 5 segments
        if (isLastSegments || startSec >= 60 || endSec >= 60) {
          console.log(`[DEBUG TIME] Segment ${index}: Raw="${timeLine}" → startMin=${startMin}, startSec=${startSec}, endMin=${endMin}, endSec=${endSec}`);
        }

        if (startMin === 0 && startSec >= 60) {
          startMin = Math.floor(startSec / 60);
          startSec = startSec % 60;
          if (isLastSegments) console.log(`[DEBUG TIME] Converted start: ${startMin}:${startSec}`);
        }
        if (endMin === 0 && endSec >= 60) {
          endMin = Math.floor(endSec / 60);
          endSec = endSec % 60;
          if (isLastSegments) console.log(`[DEBUG TIME] Converted end: ${endMin}:${endSec}`);
        }
        
        const startTime = startMin * 60 + startSec;
        const endTime = endMin * 60 + endSec;
        
        if (isLastSegments) {
          console.log(`[DEBUG TIME] Final times: ${startTime}s - ${endTime}s (duration: ${endTime - startTime}s)`);
        }
        
        // Skip segments with identical start/end times (invalid)
        if (startTime >= endTime) {
          console.warn(`[subtitlerController] Invalid time range in block ${index}: ${startTime} >= ${endTime}`);
          return null;
        }

        const rawText = lines.slice(1).join(' ').trim();
        if (!rawText) {
          return null;
        }
        
        return {
          startTime,
          endTime,
          rawText // Store raw text first
        };
      })
      .filter(Boolean) // Remove nulls from invalid blocks
      .sort((a, b) => a.startTime - b.startTime); // Sort by startTime

    // Minimal backend correction: Merge segments with very short durations that might overlap
    const mergedSegments = [];
    for (let i = 0; i < preliminarySegments.length; i++) {
      const current = preliminarySegments[i];
      const next = preliminarySegments[i + 1];
      
      // If current segment is very short (< 1s) and next segment starts at same time or very close
      if (next && (current.endTime - current.startTime) < 1 && 
          Math.abs(next.startTime - current.startTime) <= 1) {
        // Merge with next segment
        const mergedText = `${current.rawText} ${next.rawText}`.trim();
        const mergedSegment = {
          startTime: current.startTime,
          endTime: Math.max(current.endTime, next.endTime),
          rawText: mergedText
        };
        mergedSegments.push(mergedSegment);
        i++; // Skip next segment as it's been merged
        console.log(`[subtitlerController] Merged short segments: ${current.startTime}s + ${next.startTime}s`);
      } else {
        mergedSegments.push(current);
      }
    }

    if (mergedSegments.length === 0) {
      throw new Error('Keine gültigen vorläufigen Untertitel-Segmente gefunden');
    }

    // ---- Start: Calculate average segment length and enhanced scale factor based on rawText ----
    let totalChars = 0;
    let totalWords = 0;
    mergedSegments.forEach(segment => {
      totalChars += segment.rawText.length;
      totalWords += segment.rawText.split(' ').length;
    });
    const avgLength = mergedSegments.length > 0 ? totalChars / mergedSegments.length : 30;
    const avgWords = mergedSegments.length > 0 ? totalWords / mergedSegments.length : 5;

    // ---- Second pass to process text and create final segments ----
    const segments = mergedSegments.map((pSegment, index) => {
      // For ASS subtitles, we keep the raw text and let ASS handle formatting
      return {
        startTime: pSegment.startTime,
        endTime: pSegment.endTime,
        text: pSegment.rawText // Use raw text for ASS processing
      };
    });

    if (segments.length === 0) {
      throw new Error('Keine finalen Untertitel-Segmente nach der Verarbeitung gefunden');
    }

    console.log(`[subtitlerController] Parsed ${segments.length} segments. Erste 3:`,
      segments.slice(0, 3).map((s, i) => `${i}: ${s.startTime}s-${s.endTime}s "${s.text.substring(0, 20)}..."`));
    
    // Logging for the segments that are now used (almost) directly from user input for FFmpeg
    console.log(`[subtitlerController] Finale Segmente (User-Input priorisiert, keine Backend-Anpassungen):`,
      segments.map((s, i) => `${i}: ${s.startTime.toFixed(2)}-${s.endTime.toFixed(2)}s (${(s.endTime - s.startTime).toFixed(2)}s)`));
    
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

    // Log the extended calculation for short subtitles
    console.log('Font calculation:', {
      videoDimensionen: `${metadata.width}x${metadata.height}`,
      avgTextLength: avgLength.toFixed(1),
      scaleFactor: scaleFactor.toFixed(2),
      finalFontSize: `${finalFontSize}px`,
      finalSpacing: `${finalSpacing}px`
    });

    // Generate ASS subtitles BEFORE FFmpeg processing
    console.log('[ASS] Preparing ASS subtitles');
    const cacheKey = `${uploadId}_${subtitles.length}_${finalFontSize}`;
    let assFilePath = null;
    let tempFontPath = null;
    
    try {
      // Check for cached ASS content first
      let assContent = await assService.getCachedAssContent(cacheKey);
      
      if (!assContent) {
        // Generate new ASS content with optimized styling
        const styleOptions = {
          fontSize: Math.floor(finalFontSize / 2), // ASS uses different font size scale than drawtext - divide by 2 for visual equivalency
          outline: Math.max(2, Math.floor(finalFontSize / 25)),
          marginV: Math.floor(metadata.height * 0.33), // Instagram Reels: 1/3 der Höhe von unten
          marginL: 10, // Reduzierte Seitenränder
          marginR: 10,
          borderStyle: 3, // Background box
          backColor: '&H80000000', // Semi-transparent black
          primaryColor: '&Hffffff', // White text
          alignment: 2 // Bottom center alignment für Instagram Reels
        };
        
        assContent = assService.generateAssContent(segments, metadata, styleOptions);
        
        // Cache the generated content
        await assService.cacheAssContent(cacheKey, assContent);
      }
      
      // Create temporary ASS file
      assFilePath = await assService.createTempAssFile(assContent, uploadId);
      
      // Copy font to temp directory for FFmpeg access
      tempFontPath = path.join(path.dirname(assFilePath), 'GrueneType.ttf');
      try {
        await fsPromises.copyFile(FONT_PATH, tempFontPath);
        console.log(`[ASS] Copied font to temp: ${tempFontPath}`);
      } catch (fontCopyError) {
        console.warn('[ASS] Font copy failed, using system fallback:', fontCopyError.message);
        tempFontPath = null;
      }
      
      console.log(`[ASS] Created ASS file: ${assFilePath}`);
      console.log(`[ASS] Processing ${segments.length} segments with GrueneType font`);
      console.log(`[ASS] Instagram Reels positioning: ${Math.floor(metadata.height * 0.33)}px from bottom (1/3 height)`);
      
    } catch (assError) {
      console.error('[ASS] Error generating ASS subtitles:', assError);
      assFilePath = null; // Proceed without subtitles
    }

    // FFmpeg-Verarbeitung
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);
      
      // ---- Start: Intelligent quality optimization ----
      const inputFileSize = fileStats.size;
      const fileSizeMB = inputFileSize / 1024 / 1024;
      
      // Resolution-based CRF values for optimal quality
      let crf, preset, tune;
      
      if (referenceDimension >= 2160) { // 4K+
        crf = 18; // Sehr hohe Qualität für 4K
        preset = fileSizeMB > 200 ? 'fast' : 'slow';
        tune = 'film';
      } else if (referenceDimension >= 1440) { // 2K
        crf = 19; // Hohe Qualität für 2K
        preset = fileSizeMB > 150 ? 'fast' : 'slow';
        tune = 'film';
      } else if (referenceDimension >= 1080) { // FullHD
        crf = 20; // Gute Qualität für FullHD
        preset = fileSizeMB > 100 ? 'medium' : 'slow';
        tune = 'film';
      } else if (referenceDimension >= 720) { // HD
        crf = 21; // Solide Qualität für HD
        preset = fileSizeMB > 50 ? 'medium' : 'slower';
        tune = 'film';
      } else { // SD
        crf = 22; // Erhaltung für niedrige Auflösungen
        preset = 'slower'; // Mehr Zeit für bessere Kompression bei SD
        tune = 'film';
      }
      
      console.log(`[FFmpeg] ${referenceDimension}p, CRF: ${crf}, Preset: ${preset}`);

      // ---- Start: Audio preservation analysis ----
      let audioCodec, audioBitrate;
      const originalAudioCodec = metadata.originalFormat?.audioCodec;
      const originalAudioBitrate = metadata.originalFormat?.audioBitrate;
      
      // Keep original audio if it's already AAC and has good quality
      if (originalAudioCodec === 'aac' && originalAudioBitrate && originalAudioBitrate >= 128) {
        audioCodec = 'copy'; // No re-encoding
        audioBitrate = null;
      } else {
        // Resolution-based audio quality
        audioCodec = 'aac';
        if (referenceDimension >= 1440) {
          audioBitrate = '256k'; // Higher quality for 2K+
        } else if (referenceDimension >= 1080) {
          audioBitrate = '192k'; // Standard for FullHD
        } else {
          audioBitrate = '128k'; // Sufficient for HD/SD
        }
      }
      // ---- End: Audio preservation analysis ----

      // Intelligent codec choice based on resolution and compatibility
      let videoCodec;
      if (referenceDimension >= 2160 && metadata.originalFormat?.codec === 'hevc') {
        videoCodec = 'libx265'; // HEVC for 4K if original was also HEVC
      } else {
        videoCodec = 'libx264'; // H.264 for better compatibility
      }

      // Optimized output options
      const outputOptions = [
        '-y',
        `-c:v ${videoCodec}`,
        `-preset ${preset}`,
        `-crf ${crf}`,
        `-tune ${tune}`,
        // Erweiterte H.264/H.265 Optimierungen
        videoCodec === 'libx264' ? '-profile:v high' : '-profile:v main',
        videoCodec === 'libx264' ? '-level 4.1' : '-level 4.0',
        // Audio-Einstellungen
        `-c:a ${audioCodec}`,
        ...(audioBitrate ? [`-b:a ${audioBitrate}`] : []),
        // Optimierte Container-Einstellungen
        '-movflags +faststart',
        '-avoid_negative_ts make_zero'
      ];

      // Setze Rotations-Metadaten
      if (metadata.rotation && metadata.rotation !== '0') {
        outputOptions.push(`-metadata:s:v:0 rotate=${metadata.rotation}`);
      }

      command.outputOptions(outputOptions);

      // Apply ASS subtitles filter if available
      if (assFilePath) {
        // Use fontdir option to specify font directory for ASS subtitles
        const fontDir = path.dirname(tempFontPath);
        command.videoFilters([`subtitles=${assFilePath}:fontsdir=${fontDir}`]);
        console.log(`[FFmpeg] Applied ASS filter with font directory: ${assFilePath}:fontsdir=${fontDir}`);
      } else {
        console.log('[FFmpeg] No ASS subtitles available, proceeding without subtitles');
      }

      command
        .on('start', cmd => {
          console.log('[FFmpeg] Processing started');
        })
        .on('progress', async (progress) => {
          const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
          console.log('Fortschritt:', `${progressPercent}%`);
          
          // Speichere Progress in Redis
          const progressData = {
            status: 'exporting',
            progress: progressPercent,
            timeRemaining: progress.timemark
          };
          try {
            await redisClient.set(`export:${exportToken}`, JSON.stringify(progressData), { EX: 60 * 60 });
          } catch (redisError) {
            console.warn('Redis Progress Update Fehler:', redisError.message);
          }
        })
        .on('error', (err) => {
          console.error('FFmpeg Fehler:', err);
          // Try to remove progress key on error
          redisClient.del(`export:${exportToken}`).catch(delErr => console.warn(`[FFmpeg Error Cleanup] Failed to delete progress key export:${exportToken}`, delErr));
          // Cleanup ASS file and temp font on error
          if (assFilePath) {
            assService.cleanupTempFile(assFilePath).catch(cleanupErr => console.warn('[FFmpeg Error] ASS cleanup failed:', cleanupErr));
            if (tempFontPath) {
              fsPromises.unlink(tempFontPath).catch(fontErr => console.warn('[FFmpeg Error] Font cleanup failed:', fontErr.message));
            }
          }
          reject(err);
        })
        .on('end', async () => {
          console.log('FFmpeg Verarbeitung abgeschlossen');
          // Lösche Progress aus Redis
          try {
            await redisClient.del(`export:${exportToken}`);
          } catch (redisError) {
            console.warn('Redis Progress Cleanup Fehler:', redisError.message);
          }
          // Cleanup ASS file and temp font on success
          if (assFilePath) {
            await assService.cleanupTempFile(assFilePath).catch(cleanupErr => console.warn('[FFmpeg Success] ASS cleanup failed:', cleanupErr));
            if (tempFontPath) {
              await fsPromises.unlink(tempFontPath).catch(fontErr => console.warn('[FFmpeg Success] Font cleanup failed:', fontErr.message));
            }
          }
          resolve();
        });

      command.save(outputPath);
    });

    // Warte kurz, um sicherzustellen, dass die Datei vollständig geschrieben wurde
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Dateistatistiken abrufen
    const stats = await fsPromises.stat(outputPath);
    const fileSize = stats.size;

    // Send the exportToken back to the client with the file stream.
    // The client will need this token to poll for progress if it's a long operation,
    // though in this case, the file is streamed directly.
    // For a more robust progress system, the export might be a background job,
    // and the client would poll using this token.
    // Here, we set it as a custom header.
    res.setHeader('X-Export-Token', exportToken);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="subtitled_${originalFilename}"`);
    
    // Sende die Datei
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    // Cleanup nach erfolgreichem Senden - only output file, input file handled by session cleanup
    fileStream.on('end', async () => {
      await cleanupFiles(null, outputPath); // Only cleanup output file
      
      // TUS-Dateien werden jetzt automatisch durch das intelligente Cleanup-System verwaltet
      console.log(`[Export] Export abgeschlossen für ${uploadId}, Output-Datei bereinigt`);
    });

    // Error-Handling für den Stream
    fileStream.on('error', (error) => {
      console.error('Stream-Fehler:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Fehler beim Senden des Videos' });
      }
    });

  } catch (error) {
    console.error('Export-Fehler:', error);
    await cleanupFiles(null, outputPath); // Only cleanup output file on error

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Fehler beim Exportieren des Videos',
        details: error.message
      });
    }
  }
});

module.exports = router; 