const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

// Konfiguriere Multer für Video-Upload
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../../uploads/videos');
    try {
      await fsPromises.mkdir(uploadDir, { recursive: true });
      console.log('Upload-Verzeichnis bereit:', uploadDir);
      cb(null, uploadDir);
    } catch (error) {
      console.error('Fehler beim Erstellen des Upload-Verzeichnisses:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log('Generiere Dateiname:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB Limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.mov', '.avi', '.mkv'];
    const ext = path.extname(file.originalname).toLowerCase();
    console.log('Prüfe Dateityp:', {
      originalname: file.originalname,
      extension: ext,
      mimetype: file.mimetype
    });
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      console.error('Nicht unterstütztes Format:', ext);
      cb(new Error('Nicht unterstütztes Dateiformat'));
    }
  }
});

// Funktion zum Erkennen der Video-Eigenschaften
async function getVideoMetadata(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error('Fehler beim Lesen der Video-Metadaten:', err);
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('Kein Video-Stream gefunden'));
        return;
      }

      // Bestimme die tatsächliche Orientierung
      const rotation = videoStream.tags?.rotate || '0';
      const isVertical = rotation === '90' || rotation === '270';
      
      // Wenn das Video vertikal ist, tauschen wir Breite und Höhe
      const width = isVertical ? videoStream.height : videoStream.width;
      const height = isVertical ? videoStream.width : videoStream.height;

      resolve({
        width,
        height,
        duration: videoStream.duration,
        fps: eval(videoStream.r_frame_rate),
        rotation,
        displayAspectRatio: videoStream.display_aspect_ratio,
        sampleAspectRatio: videoStream.sample_aspect_ratio,
        originalFormat: {
          codec: videoStream.codec_name,
          pixelFormat: videoStream.pix_fmt,
          profile: videoStream.profile,
          level: videoStream.level
        }
      });
    });
  });
}

// Hilfsfunktion zum Extrahieren der Audio-Spur
async function extractAudio(videoPath, outputPath) {
  try {
    console.log('Starte Audio-Extraktion:', {
      inputPath: videoPath,
      outputPath: outputPath
    });

    // Prüfe ob Input-Datei existiert
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video-Datei nicht gefunden: ${videoPath}`);
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath)
        .outputOptions([
          '-vn',                // Entferne Video-Stream
          '-ar 16000',          // Sample Rate auf 16kHz (optimiert für Whisper)
          '-ac 1',              // Mono (Whisper verwendet nur einen Kanal)
          '-c:a libmp3lame',    // MP3-Codec für bessere Kompression
          '-q:a 4',             // Gute Qualität, aber kleinere Dateigröße (0-9, niedriger ist besser)
          '-y'                  // Überschreibe Output-Datei
        ]);

      // Debug-Logging
      command.on('start', (commandLine) => {
        console.log('FFmpeg Befehl:', commandLine);
      });

      command.on('progress', (progress) => {
        console.log('Fortschritt:', progress.percent?.toFixed(1) + '%');
      });

      command
        .save(outputPath)
        .on('end', () => {
          // Prüfe ob Output-Datei erstellt wurde
          if (!fs.existsSync(outputPath)) {
            reject(new Error('Audio-Datei wurde nicht erstellt'));
            return;
          }
          
          // Protokolliere Dateigröße
          const stats = fs.statSync(outputPath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`Audio-Extraktion erfolgreich: ${outputPath} (${fileSizeMB} MB)`);
          
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg Fehler:', err);
          reject(err);
        });
    });
  } catch (error) {
    console.error('Kritischer Fehler bei Audio-Extraktion:', error);
    throw error;
  }
}

// Cleanup-Funktion für temporäre Dateien
async function cleanupFiles(...filePaths) {
  for (const filePath of filePaths) {
    try {
      if (filePath) {
        await fsPromises.unlink(filePath);
        console.log('Temporäre Datei gelöscht:', filePath);
      }
    } catch (err) {
      console.warn('Fehler beim Löschen der temporären Datei:', err);
    }
  }
}

module.exports = {
  upload,
  getVideoMetadata,
  extractAudio,
  cleanupFiles
}; 