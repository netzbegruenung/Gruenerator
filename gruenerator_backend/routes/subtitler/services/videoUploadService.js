const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

// Function to get video metadata (remains unchanged)
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

      // Determine actual orientation
      const rotation = videoStream.tags?.rotate || '0';
      const isVertical = rotation === '90' || rotation === '270';
      
      // Swap width and height if vertical
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

// Helper function to extract audio track (remains unchanged)
async function extractAudio(videoPath, outputPath) {
  try {
    console.log('Starte Audio-Extraktion:', {
      inputPath: videoPath,
      outputPath: outputPath
    });

    // Check if input file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video-Datei nicht gefunden: ${videoPath}`);
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath)
        .outputOptions([
          '-vn',                // Remove video stream
          '-ar', '16000',       // Sample rate to 16kHz (optimized for Whisper)
          '-ac', '1',           // Mono (Whisper uses one channel)
          '-c:a', 'libmp3lame', // MP3 codec for better compression
          '-q:a', '4',          // Good quality, smaller file size (0-9, lower is better)
          '-y'                  // Overwrite output file
        ]);

      // Debug logging
      command.on('start', (commandLine) => {
        console.log('FFmpeg Befehl:', commandLine);
      });

      command.on('progress', (progress) => {
        console.log('Fortschritt:', progress.percent?.toFixed(1) + '%');
      });

      command
        .save(outputPath)
        .on('end', () => {
          // Check if output file was created
          if (!fs.existsSync(outputPath)) {
            reject(new Error('Audio-Datei wurde nicht erstellt'));
            return;
          }
          
          // Log file size
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

// Cleanup function for temporary files (remains unchanged)
async function cleanupFiles(...filePaths) {
  for (const filePath of filePaths) {
    try {
      if (filePath && await fsPromises.stat(filePath).catch(() => false)) { // Check if file exists before unlinking
        await fsPromises.unlink(filePath);
        console.log('Temporäre Datei gelöscht:', filePath);
      }
    } catch (err) {
      // Log only if it's not a 'file not found' error, which is expected if cleanup runs multiple times
      if (err.code !== 'ENOENT') { 
        console.warn('Fehler beim Löschen der temporären Datei:', filePath, err);
      }
    }
  }
}

module.exports = {
  getVideoMetadata,
  extractAudio,
  cleanupFiles
}; 