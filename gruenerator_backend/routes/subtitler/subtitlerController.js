const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const ffmpeg = require('fluent-ffmpeg');
const { getVideoMetadata, cleanupFiles } = require('./services/videoUploadService');
const { transcribeVideo } = require('./services/transcriptionService');
const { getFilePathFromUploadId, checkFileExists } = require('./services/tusService');
const redisClient = require('../../utils/redisClient'); // Importiere den Redis-Client

// Font-Konfiguration
const FONT_PATH = path.resolve(__dirname, '../../public/fonts/GrueneType.ttf');

// Überprüfe, ob die Font existiert
async function checkFont() {
  try {
    await fsPromises.access(FONT_PATH);
    console.log('GrueneType Font gefunden:', FONT_PATH);
  } catch (err) {
    console.error('Fehler beim Zugriff auf GrueneType Font:', err);
    throw new Error('GrueneType Font nicht gefunden');
  }
}

// Hilfsfunktion zum intelligenten Aufteilen von Text
function splitLongText(text, avgLength = 30, maxLength = 50) {
  // Entferne überflüssige Leerzeichen und Backslashes
  text = text.trim().replace(/\s+/g, ' ').replace(/\\/g, '');

  // Berechne dynamischen Schwellenwert basierend auf avgLength
  const dynamicMaxLength = Math.max(
    25, // Minimaler Schwellenwert - geändert von 15
    Math.min(
      50, // Maximaler Schwellenwert
      Math.floor(avgLength * 0.7) // Dynamischer Wert basierend auf avgLength (use factor 0.7 for earlier break)
    )
  );

  // If text is short enough, return it as is
  if (text.length <= dynamicMaxLength) {
    return text;
  }

  const words = text.split(' ');
  const totalLength = text.length;
  const targetSplitLength = totalLength / 2;

  let bestSplitIndex = -1;
  let minDiff = Infinity;
  let currentLength = 0;

  // Find the word boundary closest to the middle of the text length
  for (let i = 0; i < words.length - 1; i++) { // Iterate up to the second to last word
    currentLength += words[i].length + (i > 0 ? 1 : 0); // Add 1 for space after the first word
    const diff = Math.abs(currentLength - targetSplitLength);

    if (diff < minDiff) {
      minDiff = diff;
      bestSplitIndex = i + 1; // Split *after* this word index
    }
  }

  // If no suitable split point found (e.g., very short words), or only one word, default to splitting after the first word if possible
  if (bestSplitIndex === -1 && words.length > 1) {
      bestSplitIndex = 1;
  } else if (bestSplitIndex === -1) {
      // Cannot split (only one word, or some edge case)
      return text; 
  }


  const firstLine = words.slice(0, bestSplitIndex).join(' ');
  const secondLine = words.slice(bestSplitIndex).join(' ');

  // Never truncate the second line
  return firstLine + '\n' + secondLine;
}

// Hilfsfunktion zum Escapen von Text für FFmpeg
function escapeFFmpegText(text, avgLength = 30) {
  // Entferne zuerst alle Zeitstempel
  let cleanedText = text.replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, '').trim();
  
  // Teile lange Zeilen auf mit avgLength Parameter
  cleanedText = splitLongText(cleanedText, avgLength);
  // Escape special characters
  return cleanedText
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/,/g, '\\,')
    // .replace(/\n/g, '\n') // Removed: FFmpeg drawtext handles literal 

    .trim();
}

// Hilfsfunktion zum Konvertieren in SRT-Format
function convertToSRT(subtitles) {
  const segments = subtitles.split('\n\n')
    .map(block => {
      const [timeLine, ...textLines] = block.split('\n');
      const [timeRange] = timeLine.match(/(\d+:\d{2}) - (\d+:\d{2})/) || [];
      if (!timeRange) return null;

      const [startTime, endTime] = timeLine.split(' - ');
      const [startMin, startSec] = startTime.split(':').map(Number);
      const [endMin, endSec] = endTime.split(':').map(Number);

      // Konvertiere zu SRT-Zeitformat (HH:MM:SS,mmm)
      const startSRT = `00:${startMin.toString().padStart(2, '0')}:${startSec.toString().padStart(2, '0')},000`;
      const endSRT = `00:${endMin.toString().padStart(2, '0')}:${endSec.toString().padStart(2, '0')},000`;

      // Teile den Text in maximal zwei Zeilen
      const text = textLines.join(' ').trim();
      const formattedText = splitLongText(text);

      return {
        startTime: startSRT,
        endTime: endSRT,
        text: formattedText.replace('\\n', '\n')
      };
    })
    .filter(Boolean);

  return segments
    .map((segment, index) => {
      return `${index + 1}\n${segment.startTime} --> ${segment.endTime}\n${segment.text}\n`;
    })
    .join('\n');
}

// Route für Video-Upload und Verarbeitung
router.post('/process', async (req, res) => {
  console.log('=== SUBTITLER PROCESS START ===');
  const { uploadId, subtitlePreference = 'standard' } = req.body; // Expect uploadId and preference in request body, default to 'standard'
  let videoPath = null;

  if (!uploadId) {
    console.error('Keine Upload-ID im Request gefunden');
    return res.status(400).json({ error: 'Keine Upload-ID gefunden' });
  }

  console.log(`Verarbeitungsanfrage für Upload-ID erhalten: ${uploadId}`);

  // Setze initialen Status in Redis mit TTL (z.B. 24 Stunden)
  const initialStatus = JSON.stringify({ status: 'processing' });
  try {
      await redisClient.set(`job:${uploadId}`, initialStatus, { EX: 60 * 60 * 24 }); // EX für Sekunden (24h)
      console.log(`[Upstash Redis] Status 'processing' für ${uploadId} gesetzt.`);
  } catch (redisError) {
      console.error(`[Upstash Redis] Fehler beim Setzen des initialen Status für ${uploadId}:`, redisError);
      // Sende Fehlerantwort an Client, falls noch nicht geschehen
       if (!res.headersSent) {
          return res.status(500).json({ error: 'Interner Serverfehler beim Start der Verarbeitung (Redis).' });
       }
       // Breche weitere Verarbeitung ab, wenn Status nicht gesetzt werden konnte
       return; 
  }

  try {
    videoPath = getFilePathFromUploadId(uploadId);
    console.log(`Abgeleiteter Videopfad: ${videoPath}`);

    const fileExists = await checkFileExists(videoPath);
    if (!fileExists) {
        console.error(`Video-Datei für Upload-ID nicht gefunden: ${uploadId} am Pfad: ${videoPath}`);
        // Setze Fehlerstatus in Redis
        const errorNotFoundStatus = JSON.stringify({ status: 'error', data: 'Zugehörige Video-Datei nicht gefunden.' });
        try {
            await redisClient.set(`job:${uploadId}`, errorNotFoundStatus, { EX: 60 * 60 * 24 }); 
        } catch (redisSetError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'file not found' Status für ${uploadId}:`, redisSetError);
        }
        return res.status(404).json({ error: 'Zugehörige Video-Datei nicht gefunden.' });
    }

    // Log basic info (size/format might need ffprobe if not in tus metadata)
    // We can get metadata after confirming file exists
    const fileStats = await fsPromises.stat(videoPath);
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

    // Extrahiere die gewünschte Transkriptionsmethode
    // const transcriptionMethod = 'openai'; // Immer OpenAI verwenden - Wird nicht mehr direkt benötigt
    // console.log('Transkription: OpenAI'); // Method wird implizit von transcribeVideo gehandhabt
    console.log(`Untertitel Präferenz: ${subtitlePreference}`); // Log preference

    console.log('Starte Transkription...');
    
    // Run transcription asynchronously (don't wait here)
    // Korrigierter Aufruf: Übergebe subtitlePreference als zweiten Parameter und den aiWorkerPool
    const aiWorkerPool = req.app.locals.aiWorkerPool; // Get pool from app locals
    if (!aiWorkerPool) {
        // Handle case where pool is not available
        console.error(`[subtitlerController] AI Worker Pool not found in app locals for ${uploadId}. Cannot generate short subtitles if requested.`);
        // Set error status or proceed without short subtitle capability
         const errorPoolStatus = JSON.stringify({ status: 'error', data: 'AI Worker Pool nicht konfiguriert.' });
         try {
            await redisClient.set(`job:${uploadId}`, errorPoolStatus, { EX: 60 * 60 * 24 }); 
            console.log(`[Upstash Redis] Status 'error' (AI Pool missing) für ${uploadId} gesetzt.`);
        } catch (redisError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'AI Pool missing' Status für ${uploadId}:`, redisError);
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
        // Setze 'complete' Status in Redis
        const finalStatus = JSON.stringify({ status: 'complete', data: subtitles });
        try {
            await redisClient.set(`job:${uploadId}`, finalStatus, { EX: 60 * 60 * 24 }); // TTL erneuern/setzen
            console.log(`[Upstash Redis] Status 'complete' für ${uploadId} gesetzt.`);
        } catch (redisError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'complete' Status für ${uploadId}:`, redisError);
             // Fehler loggen, aber fortfahren (Job bleibt evtl. 'processing')
        }
      })
      .catch(async (error) => {
        console.error(`Fehler bei der asynchronen Verarbeitung für Upload-ID ${uploadId}:`, error);
        // Setze 'error' Status in Redis
        const errorStatus = JSON.stringify({ status: 'error', data: error.message || 'Fehler bei der Verarbeitung.' });
         try {
            await redisClient.set(`job:${uploadId}`, errorStatus, { EX: 60 * 60 * 24 }); // TTL für Fehler setzen
            console.log(`[Upstash Redis] Status 'error' für ${uploadId} gesetzt.`);
        } catch (redisError) {
             console.error(`[Upstash Redis] Fehler beim Setzen des 'error' Status für ${uploadId}:`, redisError);
        }
        // Cleanup the source file if processing failed critically
        cleanupFiles(videoPath).catch(e => console.error('Cleanup failed after error:', e));
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
        // await redisClient.set(`job:${uploadId}`, criticalErrorStatus, { EX: 60 * 60 * 24, NX: true }); // NX = Nur setzen, wenn Key nicht existiert
        await redisClient.set(`job:${uploadId}`, criticalErrorStatus, { EX: 60 * 60 * 24 }); // Überschreibt ggf. 'processing'
        console.log(`[Upstash Redis] Status 'error' (critical) für ${uploadId} gesetzt.`);
    } catch (redisError) {
         console.error(`[Upstash Redis] Fehler beim Setzen des 'critical error' Status für ${uploadId}:`, redisError);
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
    let jobDataString;

    try {
        jobDataString = await redisClient.get(`job:${uploadId}`);
        console.log(`[Upstash Redis] Status für ${uploadId} abgefragt. Rohdaten:`, jobDataString);
    } catch (redisError) {
        console.error(`[Upstash Redis] Fehler beim Abrufen des Status für ${uploadId}:`, redisError);
        return res.status(500).json({ status: 'error', error: 'Interner Serverfehler beim Abrufen des Job-Status.' });
    }

    if (!jobDataString) {
        return res.status(404).json({ status: 'not_found', error: 'Kein Job für diese ID gefunden.' });
    }

    try {
        const job = JSON.parse(jobDataString);
        console.log(`Statusabfrage für Job ${uploadId}: ${job.status}`);

        switch (job.status) {
            case 'processing':
                return res.status(200).json({ status: 'processing' });
            case 'complete':
                return res.status(200).json({ status: 'complete', subtitles: job.data });
            case 'error':
                return res.status(200).json({ status: 'error', error: job.data });
            default:
                console.error(`Unbekannter Job-Status in Redis für ${uploadId}:`, job.status);
                return res.status(500).json({ status: 'unknown', error: 'Unbekannter Job-Status.' });
        }
    } catch (parseError) {
        console.error(`Fehler beim Parsen der Redis-Daten für ${uploadId}:`, parseError, 'Daten:', jobDataString);
        return res.status(500).json({ status: 'error', error: 'Interner Fehler beim Lesen des Job-Status.' });
    }
});

// Route zum Herunterladen des fertigen Videos
router.post('/export', async (req, res) => {
  // Expect uploadId and subtitles in body
  const { uploadId, subtitles } = req.body; 
  let inputPath = null;
  let outputPath = null;
  let originalFilename = 'video.mp4'; // Default filename

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

    // Berechne Schriftgröße basierend auf der Videoauflösung
    const baseFontSize = 48; // Basis-Schriftgröße für 1080p
    const minFontSize = 16;  // Minimum für kleine Videos
    const maxFontSize = 48;  // Maximum für große Videos
    
    // Bestimme die relevante Dimension basierend auf der Video-Orientierung
    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;
    
    // Berechne Schriftgröße basierend auf der Referenzdimension
    // Angepasste Prozentsätze für verschiedene Auflösungen
    let percentage;
    if (referenceDimension >= 1920) { // Full HD und größer
      percentage = isVertical ? 0.046 : 0.038; // 4.6% der Breite / 3.8% der Höhe
    } else if (referenceDimension >= 1080) { // HD
      percentage = isVertical ? 0.04 : 0.03; // 4% der Breite / 3% der Höhe
    } else { // Kleinere Auflösungen
      percentage = isVertical ? 0.035 : 0.03; // 3.5% der Breite / 3% der Höhe
    }
    
    const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(referenceDimension * percentage)));

    // Berechne den Zeilenabstand mit Hybrid-Ansatz
    const minSpacing = 40; // Minimaler Abstand in Pixeln
    const maxSpacing = fontSize * 1.25;
    const spacing = Math.max(minSpacing, Math.min(maxSpacing, fontSize * (1.5 + (1 - fontSize/48))));

    // Verbesserte Verarbeitung der Untertitel-Segmente
    const segments = subtitles
      .split(/\n(?=\d+:\d{2}\s*-\s*\d+:\d{2})/)
      .map(block => {
        const lines = block.trim().split('\n');
        const timeLine = lines[0].trim();
        // Unterstützt auch Stunden:SS - MM:SS
        const timeMatch = timeLine.match(/^(\d+):(\d{2})\s*-\s*(\d+):(\d{2})$/);
        if (!timeMatch) return null;

        const [_, startMin, startSec, endMin, endSec] = timeMatch;
        // Millisekunden übernehmen, falls vorhanden
        const startTime = (parseInt(startMin) * 60 + parseFloat(startSec)).toFixed(3);
        const endTime = (parseInt(endMin) * 60 + parseFloat(endSec)).toFixed(3);

        // Teile den Text in maximal zwei Zeilen
        const text = lines.slice(1).join(' ').trim();
        const formattedText = splitLongText(text);

        return {
          startTime: parseFloat(startTime),
          endTime: parseFloat(endTime),
          text: formattedText.replace('\\n', '\n')
        };
      })
      .filter(Boolean)
      // Sortiere nach Startzeit um sicherzustellen, dass die Reihenfolge stimmt
      .sort((a, b) => a.startTime - b.startTime);

    if (segments.length === 0) {
      throw new Error('Keine Untertitel-Segmente gefunden');
    }

    // Überlappungen ohne Puffer korrigieren
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i].endTime > segments[i + 1].startTime) {
        segments[i].endTime = segments[i + 1].startTime;
      }
    }

    // ---- Start: Calculate average segment length and scale factor ----
    let totalChars = 0;
    segments.forEach(segment => {
      totalChars += segment.text.length;
    });
    const avgLength = segments.length > 0 ? totalChars / segments.length : 30; // Default to medium if no segments

    const calculateScaleFactor = (avg) => {
        const shortThreshold = 15;
        const longThreshold = 45;
        const minFactor = 0.9; // Scale down slightly for long text
        const maxFactor = 1.15; // Scale up more for very short text

        if (avg <= shortThreshold) {
            return maxFactor;
        } else if (avg >= longThreshold) {
            return minFactor;
        } else {
            // Linear interpolation between thresholds
            const range = longThreshold - shortThreshold;
            const position = avg - shortThreshold;
            const factor = maxFactor - ((maxFactor - minFactor) * (position / range));
            return factor;
        }
    };

    const scaleFactor = calculateScaleFactor(avgLength);

    // Apply scale factor and clamp
    const finalFontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(fontSize * scaleFactor)));
    // Also scale maxSpacing when scaling up, keep minSpacing fixed
    const scaledMaxSpacing = maxSpacing * (scaleFactor > 1 ? scaleFactor : 1);
    const finalSpacing = Math.max(minSpacing, Math.min(scaledMaxSpacing, Math.floor(spacing * scaleFactor)));

    // ---- End: Calculate average segment length and scale factor ----

    // +++ Start Debug Logging for Spacing +++
    console.log('Debug Spacing Calculation:', {
      minSpacing,
      maxSpacing,
      scaledMaxSpacing,
      spacing, // Original spacing before final calc
      fontSize,
      scaleFactor,
      finalFontSize, // Used in filter
      finalSpacing // Used in filter
    });
    // +++ End Debug Logging for Spacing +++

    // Log die Berechnung (updated with final values)
    console.log('Schriftgrößenberechnung:', {
      videoDimensionen: `${metadata.width}x${metadata.height}`,
      orientierung: isVertical ? 'vertikal' : 'horizontal',
      referenzDimension: referenceDimension,
      auflösungskategorie: referenceDimension >= 1920 ? 'Full HD+' : 
                          referenceDimension >= 1080 ? 'HD' : 'SD',
      prozent: `${(percentage * 100).toFixed(1)}%`,
      berechneteGröße: `${fontSize}px`, // Original calculation
      durchschnittlicheSegmentLänge: avgLength.toFixed(1),
      skalierungsFaktor: scaleFactor.toFixed(2),
      finaleSchriftgröße: `${finalFontSize}px (${(finalFontSize/referenceDimension*100).toFixed(1)}% der ${isVertical ? 'Breite' : 'Höhe'})`,
      finalerZeilenabstand: {
           minimal: `${minSpacing}px`,
           maximal: `${scaledMaxSpacing.toFixed(1)}px`, // Show scaled max
           berechnet: `${finalSpacing.toFixed(1)}px`,
           verhältnis: `${(finalSpacing/finalFontSize).toFixed(2)}x`
       }
    });

    // FFmpeg-Verarbeitung
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);
      
      // ---- Start: Dynamically select preset based on input file size ----
      const sizeThreshold = 100 * 1024 * 1024; // 100 MB in bytes
      const inputFileSize = fileStats.size;
      let chosenPreset;

      if (inputFileSize > sizeThreshold) {
        chosenPreset = 'veryfast'; 
        console.log(`[FFmpeg Preset] Input size (${(inputFileSize / 1024 / 1024).toFixed(1)} MB) > 100 MB. Using preset: ${chosenPreset}`);
      } else {
        chosenPreset = 'medium';
        console.log(`[FFmpeg Preset] Input size (${(inputFileSize / 1024 / 1024).toFixed(1)} MB) <= 100 MB. Using preset: ${chosenPreset}`);
      }
      // ---- End: Dynamically select preset ----

      // Setze Basis-Optionen
      const outputOptions = [
        '-y',
        // Verwende den originalen Codec wenn möglich, sonst H.264
        metadata.originalFormat?.codec === 'hevc' ? '-c:v hevc' : '-c:v libx264',
        // Qualitätseinstellungen
        `-preset ${chosenPreset}`,  // Use the dynamically chosen preset
        '-crf 23',           // Gute Qualität (0-51, niedriger ist besser)
        // Kopiere Audio ohne Neucodierung
        '-c:a copy',
        // Optimiere für Streaming
        '-movflags faststart+frag_keyframe+empty_moov'
      ];

      // Setze Rotations-Metadaten
      if (metadata.rotation && metadata.rotation !== '0') {
        outputOptions.push(`-metadata:s:v:0 rotate=${metadata.rotation}`);
      }

      command.outputOptions(outputOptions);

      // Erstelle Filter für Untertitel (using finalFontSize and finalSpacing)
      const filters = segments
        .map((segment, index) => {
          // +++ Start Debug Logging per Segment +++
          console.log(`\n--- Debug Segment ${index} ---`);
          console.log('Original Text:', segment.text);
          
          const escapedText = escapeFFmpegText(segment.text, avgLength);
          console.log('Escaped Text:', JSON.stringify(escapedText)); // Use JSON.stringify to see \n
          const hasNewline = escapedText.includes('\n');
          console.log('Has Newline:', hasNewline);
          // +++ End Debug Logging per Segment +++
          
          const isVertical = metadata.rotation === '90' || metadata.rotation === '270';
          const yPosBase = isVertical ? 'h*0.7' : 'h*0.7'; // Basis-Y-Position
          
          let filterString = '';

          if (hasNewline) {
            // Fall 1: Text wurde geteilt
            const [line1, line2] = escapedText.split('\n');
            
            const yPosLine1 = yPosBase;
            const yPosLine2 = `${yPosBase}+${finalSpacing}`;
            console.log('Calculated Y Pos:', { line1: yPosLine1, line2: yPosLine2 }); // Log Y positions

            const line1Filter = `drawtext=text='${line1}':` +
              `fontfile='${FONT_PATH}':` +
              `fontsize=${finalFontSize}:` +
              `fontcolor=white:` +
              `box=1:` +
              `boxcolor=black@0.8:` +
              `boxborderw=8:` +
              `x=(w-text_w)/2:` +
              `y=${yPosLine1}:` + // Position Zeile 1
              `enable='between(t,${segment.startTime},${segment.endTime})'`;

            const line2Filter = `,drawtext=text='${line2}':` + // Komma als Trenner
              `fontfile='${FONT_PATH}':` +
              `fontsize=${finalFontSize}:` +
              `fontcolor=white:` +
              `box=1:` +
              `boxcolor=black@0.8:` +
              `boxborderw=8:` +
              `x=(w-text_w)/2:` +
              `y=${yPosLine2}:` + // Position Zeile 2
              `enable='between(t,${segment.startTime},${segment.endTime})'`;

            filterString = line1Filter + line2Filter;

          } else {
            // Fall 2: Text wurde NICHT geteilt (oder hatte ursprünglich keinen Umbruch)
            const yPosLine1 = yPosBase;
            console.log('Calculated Y Pos:', { line1: yPosLine1 }); // Log Y position

            const line1Filter = `drawtext=text='${escapedText}':` + // Gesamter Text in line1
              `fontfile='${FONT_PATH}':` +
              `fontsize=${finalFontSize}:` +
              `fontcolor=white:` +
              `box=1:` +
              `boxcolor=black@0.8:` +
              `boxborderw=8:` +
              `x=(w-text_w)/2:` +
              `y=${yPosLine1}:` + // Zentriert positionieren (nur eine Zeile)
              `enable='between(t,${segment.startTime},${segment.endTime})'`;

            filterString = line1Filter;
          }
          console.log('Generated Filter String:', filterString);
          console.log(`--- End Debug Segment ${index} ---\n`);
          return filterString;
        })
        .join(','); // Füge die einzelnen Filter-Strings zusammen

      // Wende Filter an
      command.videoFilters(filters);

      // Debug-Logging (Update to show final size if needed)
      command
        .on('start', cmd => {
          console.log('FFmpeg-Befehl:', cmd);
          console.log('Video-Metadaten:', {
            rotation: metadata.rotation,
            codec: metadata.originalFormat?.codec,
            dimensions: `${metadata.width}x${metadata.height}`,
            schriftgröße: `${finalFontSize}px (${(finalFontSize/referenceDimension*100).toFixed(1)}% der Höhe)`,
            preset: chosenPreset // Log the chosen preset as well
          });
          
          // Logge den kompletten Filter-String für die erste Zeile (using finalFontSize)
          const firstSegment = segments[0];
          if (firstSegment) {
              const escapedText = escapeFFmpegText(firstSegment.text, avgLength);
              // Split directly on newline character
              const [line1] = escapedText.split('\n'); 
              const isVertical = metadata.rotation === '90' || metadata.rotation === '270';
              const yPos = isVertical ? 'h*0.7' : 'h*0.7';
              
              const line1Filter = `drawtext=text='${line1}':` +
              `fontfile='${FONT_PATH}':` +
              `fontsize=${finalFontSize}:` + // Use finalFontSize
              `fontcolor=white:` +
              `box=1:` +
              `boxcolor=black@0.8:` +
              `boxborderw=8:` +
              `x=(w-text_w)/2:` +
              `y=${yPos}:` +
              `enable='between(t,${firstSegment.startTime},${firstSegment.endTime})'`;
              
              console.log('FFmpeg Filter Details:', {
                  filterString: line1Filter,
                  text: line1,
                  fontSize: finalFontSize, // Show finalFontSize
                  boxborderw: 8,
                  yPosition: yPos,
                  startTime: firstSegment.startTime,
                  endTime: firstSegment.endTime
              });
          }
        })
        .on('progress', progress => console.log('Fortschritt:', progress.percent ? `${progress.percent.toFixed(1)}%` : 'Verarbeite...'))
        .on('error', (err) => {
          console.error('FFmpeg Fehler:', err);
          reject(err);
        })
        .on('end', () => {
          console.log('FFmpeg Verarbeitung abgeschlossen');
          resolve();
        });

      command.save(outputPath);
    });

    // Warte kurz, um sicherzustellen, dass die Datei vollständig geschrieben wurde
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Dateistatistiken abrufen
    const stats = await fsPromises.stat(outputPath);
    const fileSize = stats.size;

    // Headers für Download
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="subtitled_${originalFilename}"`);
    
    // Sende die Datei
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    // Cleanup nach erfolgreichem Senden
    fileStream.on('end', async () => {
      await cleanupFiles(inputPath, outputPath);
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
    await cleanupFiles(inputPath, outputPath);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Fehler beim Exportieren des Videos',
        details: error.message
      });
    }
  }
});

// Route zum Herunterladen der Untertitel als SRT
router.post('/download-srt', (req, res) => {
  try {
    if (!req.body.subtitles) {
      return res.status(400).json({ error: 'Keine Untertitel gefunden' });
    }

    const srtContent = convertToSRT(req.body.subtitles);
    
    // Setze Header für den Download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename=subtitles.srt');
    
    // Sende die SRT-Datei
    res.send(srtContent);

  } catch (error) {
    console.error('Fehler beim Erstellen der SRT-Datei:', error);
    res.status(500).json({
      error: 'Fehler beim Erstellen der SRT-Datei',
      details: error.message
    });
  }
});

module.exports = router; 