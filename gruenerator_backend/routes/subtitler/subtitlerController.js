const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const ffmpeg = require('fluent-ffmpeg');
const { upload, getVideoMetadata, cleanupFiles } = require('./services/videoUploadService');
const { transcribeVideo } = require('./services/transcriptionService');

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
function splitLongText(text, maxLength = 30) {
  // Entferne überflüssige Leerzeichen und Backslashes
  text = text.trim().replace(/\s+/g, ' ').replace(/\\/g, '');
  
  if (text.length <= maxLength) {
    return text;
  }

  const words = text.split(' ');
  let firstLine = [];
  let secondLine = [];
  let currentLength = 0;

  // Erste Zeile füllen
  for (const word of words) {
    const newLength = currentLength + word.length + (currentLength > 0 ? 1 : 0);
    if (newLength <= maxLength) {
      firstLine.push(word);
      currentLength = newLength;
    } else {
      break;
    }
  }

  // Restliche Wörter in die zweite Zeile
  secondLine = words.slice(firstLine.length);

  // Zweite Zeile kürzen falls nötig
  let secondLineText = secondLine.join(' ');
  if (secondLineText.length > maxLength) {
    let currentLength = 0;
    secondLine = [];
    for (const word of secondLineText.split(' ')) {
      const newLength = currentLength + word.length + (currentLength > 0 ? 1 : 0);
      if (newLength <= maxLength) {
        secondLine.push(word);
        currentLength = newLength;
      } else {
        break;
      }
    }
    secondLineText = secondLine.join(' ');
  }

  // Nutze einfachen Backslash für den Zeilenumbruch
  return firstLine.join(' ') + '\n' + secondLineText;
}

// Hilfsfunktion zum Escapen von Text für FFmpeg
function escapeFFmpegText(text) {
  // Entferne zuerst alle Zeitstempel
  let cleanedText = text.replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, '').trim();
  
  // Teile lange Zeilen auf
  cleanedText = splitLongText(cleanedText);
  
  // Escape spezielle Zeichen
  return cleanedText
    .replace(/'/g, "'\\\\''")
    .replace(/:/g, '\\\\:')
    .replace(/-/g, '\\\\-')
    .replace(/\./g, '\\\\.')
    .replace(/,/g, '\\\\,')
    .replace(/\n/g, '\\n')  // Konvertiere Zeilenumbrüche für FFmpeg
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
router.post('/process', upload.single('video'), async (req, res) => {
  console.log('Upload-Anfrage empfangen');
  
  try {
    if (!req.file) {
      console.error('Keine Datei im Request gefunden');
      return res.status(400).json({ error: 'Keine Video-Datei gefunden' });
    }

    console.log('Datei empfangen:', {
      originalname: req.file.originalname,
      größe: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      pfad: req.file.path,
      mimetype: req.file.mimetype
    });

    // Prüfe Videogröße
    if (req.file.size > 95 * 1024 * 1024) { // 95MB Limit
      throw new Error('Das Video ist zu groß. Die maximale Größe beträgt 95MB.');
    }

    // Extrahiere die gewünschte Transkriptionsmethode
    const transcriptionMethod = req.query.method || 'openai'; // Default ist OpenAI
    console.log('Verwende Transkriptionsmethode:', transcriptionMethod);

    // Log Upload-Metadaten
    const uploadMetadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    console.log('Upload-Info:', {
      größe: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      format: req.file.mimetype,
      clientDimensionen: uploadMetadata.width && uploadMetadata.height ? 
        `${uploadMetadata.width}x${uploadMetadata.height}` : 'unbekannt',
      transkriptionsmethode: transcriptionMethod
    });

    console.log('Starte Transkription...');
    // Starte Transkription mit der gewählten Methode
    const subtitles = await transcribeVideo(req.file.path, transcriptionMethod);
    
    if (!subtitles) {
      console.error('Keine Untertitel generiert');
      throw new Error('Keine Untertitel generiert');
    }

    console.log('Sende Antwort an Client');
    res.json({ success: true, subtitles });

  } catch (error) {
    console.error('Fehler bei der Verarbeitung:', error);
    res.status(500).json({
      error: 'Fehler bei der Verarbeitung des Videos',
      details: error.message
    });
  } finally {
    if (req.file?.path) {
      console.log('Cleanup temporäre Dateien');
      await cleanupFiles(req.file.path);
    }
  }
});

// Route zum Herunterladen des fertigen Videos
router.post('/export', upload.single('video'), async (req, res) => {
  let inputPath = null;
  let outputPath = null;

  try {
    if (!req.file || !req.body.subtitles) {
      return res.status(400).json({ error: 'Video und Untertitel werden benötigt' });
    }

    inputPath = req.file.path;
    await checkFont();
    const metadata = await getVideoMetadata(inputPath);
    
    // Log Export-Metadaten
    console.log('Export-Info:', {
      inputGröße: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      dimensionen: `${metadata.width}x${metadata.height}`,
      rotation: metadata.rotation || 'keine'
    });

    console.log('Starte Video-Export');
    console.log('Video-Datei:', inputPath);
    
    const outputDir = path.join(__dirname, '../../uploads/exports');
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    outputPath = path.join(outputDir, `subtitled_${Date.now()}${path.extname(req.file.originalname)}`);
    console.log('Ausgabepfad:', outputPath);

    // Verbesserte Verarbeitung der Untertitel-Segmente
    const segments = req.body.subtitles
      .split(/\n(?=\d+:\d{2}\s*-\s*\d+:\d{2})/)
      .map(block => {
        const lines = block.trim().split('\n');
        const timeLine = lines[0].trim();
        
        const timeMatch = timeLine.match(/^(\d+):(\d{2})\s*-\s*(\d+):(\d{2})$/);
        if (!timeMatch) return null;

        const [_, startMin, startSec, endMin, endSec] = timeMatch;
        const startTime = parseInt(startMin) * 60 + parseInt(startSec);
        const endTime = parseInt(endMin) * 60 + parseInt(endSec);
        
        // Minimale Pause zwischen Segmenten (0.1 Sekunden)
        const adjustedEndTime = endTime - 0.1;

        return {
          startTime,
          endTime: adjustedEndTime,
          text: lines.slice(1).join(' ').trim()
        };
      })
      .filter(Boolean)
      // Sortiere nach Startzeit um sicherzustellen, dass die Reihenfolge stimmt
      .sort((a, b) => a.startTime - b.startTime);

    if (segments.length === 0) {
      throw new Error('Keine Untertitel-Segmente gefunden');
    }

    // Stelle sicher, dass die Segmente nahtlos aneinander anschließen
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i].endTime > segments[i + 1].startTime) {
        segments[i].endTime = segments[i + 1].startTime - 0.1;
      }
    }

    // FFmpeg-Verarbeitung
    await new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);
      
      // Setze Basis-Optionen
      const outputOptions = [
        '-y',
        // Verwende den originalen Codec wenn möglich, sonst H.264
        metadata.originalFormat?.codec === 'hevc' ? '-c:v hevc' : '-c:v libx264',
        // Qualitätseinstellungen
        '-preset ultrafast',  // Schnellere Verarbeitung
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

      // Erstelle Filter für Untertitel
      const filters = segments
        .map(segment => {
          const escapedText = escapeFFmpegText(segment.text);
          const [line1, line2] = escapedText.split('\\n');
          
          // Berechne Text-Position basierend auf tatsächlichen Dimensionen
          const isVertical = metadata.rotation === '90' || metadata.rotation === '270';
          // Position auf ca. 70% der tatsächlichen Höhe (30% von unten)
          const yPos = isVertical ? 'h*0.7' : 'h*0.7';
          
          const line1Filter = `drawtext=text='${line1}':` +
            `fontfile='${FONT_PATH}':` +
            `fontsize=72:` +
            `fontcolor=white:` +
            `box=1:` +
            `boxcolor=black@0.8:` +
            `boxborderw=8:` +
            `x=(w-text_w)/2:` +
            `y=${yPos}:` +
            `enable='between(t,${segment.startTime},${segment.endTime})'`;
            
          const line2Filter = line2 ? 
            `,drawtext=text='${line2}':` +
            `fontfile='${FONT_PATH}':` +
            `fontsize=72:` +
            `fontcolor=white:` +
            `box=1:` +
            `boxcolor=black@0.8:` +
            `boxborderw=8:` +
            `x=(w-text_w)/2:` +
            `y=${yPos}+80:` +  // Zweite Zeile 80 Pixel unter der ersten
            `enable='between(t,${segment.startTime},${segment.endTime})'` : '';
            
          return line1Filter + line2Filter;
        })
        .join(',');

      // Wende Filter an
      command.videoFilters(filters);

      // Debug-Logging
      command
        .on('start', cmd => {
          console.log('FFmpeg-Befehl:', cmd);
          console.log('Video-Metadaten:', {
            rotation: metadata.rotation,
            codec: metadata.originalFormat?.codec,
            dimensions: `${metadata.width}x${metadata.height}`
          });
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
    res.setHeader('Content-Disposition', `attachment; filename="subtitled_${req.file.originalname}"`);
    
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