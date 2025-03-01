const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { nodewhisper } = require('nodejs-whisper');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Konfiguration für Multer (Datei-Upload)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/voice');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Speichere als mp3, um Probleme mit dem WAV-Format zu vermeiden
    cb(null, 'audio-' + uniqueSuffix + '.mp3');
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB Limit
  fileFilter: (req, file, cb) => {
    // Akzeptiere nur Audio-Dateien
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Nur Audio-Dateien werden unterstützt'));
    }
  }
});

// Konvertiere Audio-Datei zu WAV mit ffmpeg
async function convertToWav(inputPath) {
  try {
    const outputPath = inputPath.replace(/\.[^/.]+$/, '') + '.wav';
    
    // Verwende den installierten ffmpeg-Pfad
    const ffmpegCommand = `"${ffmpegPath}" -y -i "${inputPath}" -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}"`;
    console.log('Ausführung von ffmpeg-Befehl:', ffmpegCommand);
    
    const { stdout, stderr } = await execPromise(ffmpegCommand);
    if (stderr) {
      console.log('ffmpeg stderr:', stderr);
    }
    
    // Prüfe, ob die Ausgabedatei existiert
    try {
      await fs.access(outputPath);
      console.log('WAV-Datei erfolgreich erstellt:', outputPath);
      
      // Lösche die ursprüngliche Datei
      await fs.unlink(inputPath);
      
      return outputPath;
    } catch (err) {
      throw new Error(`Konvertierte Datei wurde nicht erstellt: ${err.message}`);
    }
  } catch (error) {
    console.error('Fehler bei der Konvertierung:', error);
    throw new Error('Fehler bei der Audio-Konvertierung: ' + error.message);
  }
}

// Transkribiere Audio-Datei mit Whisper
async function transcribeAudio(audioPath, options = {}) {
  const { language = 'de', removeTimestamps = false } = options;
  
  try {
    console.log('Starte Transkription:', audioPath, 'Optionen:', options);
    
    // Konvertiere die Datei zu WAV
    const wavPath = await convertToWav(audioPath);
    console.log('Konvertiert zu WAV:', wavPath);
    
    const whisperConfig = {
      modelName: "base",
      whisperOptions: {
        language: language,
        task: "transcribe"
      }
    };
    
    const result = await nodewhisper(wavPath, whisperConfig);
    let transcription = typeof result === 'string' ? result : result.text;
    
    if (!transcription) {
      throw new Error('Keine Transkription erhalten');
    }
    
    // Entferne Zeitstempel nur wenn gewünscht
    if (removeTimestamps) {
      console.log('Entferne Zeitstempel aus der Transkription');
      
      // Entferne Zeitstempel (Format [00:00:00.000 --> 00:00:00.000] oder [00:00.000 --> 00:00.000])
      transcription = transcription.replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3} --> \d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '');
      
      // Entferne andere mögliche Zeitformate
      transcription = transcription.replace(/\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}\s*/g, '');
      transcription = transcription.replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*/g, '');
      
      // Entferne Whisper-spezifische Zeitstempel (z.B. [00:00.000] oder [00:00:00.000])
      transcription = transcription.replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '');
      
      // Entferne doppelte Leerzeichen und trimme
      transcription = transcription.replace(/\s+/g, ' ').trim();
    } else {
      // Nur trimmen, wenn Zeitstempel beibehalten werden sollen
      transcription = transcription.trim();
    }
    
    return transcription;
  } catch (error) {
    console.error('Fehler bei der Transkription:', error);
    throw error;
  }
}

// Cleanup-Funktion für temporäre Dateien
async function cleanupFile(filePath) {
  try {
    if (await fs.access(filePath).then(() => true).catch(() => false)) {
      await fs.unlink(filePath);
      console.log('Datei gelöscht:', filePath);
    }
  } catch (error) {
    console.error('Fehler beim Löschen der Datei:', error);
  }
}

// POST /api/voice/transcribe - Transkribiere Audio-Datei
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Keine Audio-Datei erhalten'
    });
  }

  const audioPath = req.file.path;
  
  // Optionen aus Query-Parametern oder Body extrahieren
  const options = {
    language: req.query.language || req.body.language || 'de',
    removeTimestamps: req.query.removeTimestamps === 'true' || req.body.removeTimestamps === true
  };
  
  try {
    const transcription = await transcribeAudio(audioPath, options);
    
    // Cleanup nach erfolgreicher Transkription
    await cleanupFile(audioPath);
    
    return res.json({
      success: true,
      text: transcription,
      withTimestamps: !options.removeTimestamps
    });
  } catch (error) {
    console.error('Fehler bei der Verarbeitung:', error);
    
    // Cleanup bei Fehler
    await cleanupFile(audioPath);
    
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Transkription: ' + error.message
    });
  }
});

module.exports = router; 