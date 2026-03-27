/**
 * Video Upload Service
 *
 * Extracts metadata and audio from video files using FFmpeg.
 */

import fs from 'fs';
import path from 'path';

import { createLogger } from '../../utils/logger.js';

import { ffmpeg, normalizeRotation, type FFprobeMetadata } from './ffmpegWrapper.js';

const fsPromises = fs.promises;
const log = createLogger('videoUpload');

interface OriginalFormat {
  codec: string | undefined;
  pixelFormat: string | undefined;
  profile: string | undefined;
  level: number | undefined;
  videoBitrate: number | null;
  audioCodec: string | null;
  audioBitrate: number | null;
}

interface VideoMetadata {
  width: number;
  height: number;
  duration: string | undefined;
  fps: number;
  rotation: string;
  displayAspectRatio: string | undefined;
  sampleAspectRatio: string | undefined;
  originalFormat: OriginalFormat;
}

async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err: Error | null, metadata?: FFprobeMetadata) => {
      if (err) {
        log.error('Fehler beim Lesen der Video-Metadaten:', err);
        reject(err);
        return;
      }

      if (!metadata) {
        reject(new Error('Keine Metadaten erhalten'));
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('Kein Video-Stream gefunden'));
        return;
      }

      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      const rotationDegrees = normalizeRotation(videoStream);
      const rotation = String(rotationDegrees);
      const isVertical = rotationDegrees === 90 || rotationDegrees === 270;

      const width = isVertical ? videoStream.height || 0 : videoStream.width || 0;
      const height = isVertical ? videoStream.width || 0 : videoStream.height || 0;

      let fps = 0;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        fps = den ? num / den : num;
      }

      resolve({
        width,
        height,
        duration: videoStream.duration,
        fps,
        rotation,
        displayAspectRatio: videoStream.display_aspect_ratio,
        sampleAspectRatio: videoStream.sample_aspect_ratio,
        originalFormat: {
          codec: videoStream.codec_name,
          pixelFormat: videoStream.pix_fmt,
          profile: videoStream.profile,
          level: videoStream.level,
          videoBitrate: videoStream.bit_rate ? parseInt(videoStream.bit_rate) : null,
          audioCodec: audioStream?.codec_name || null,
          audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) : null,
        },
      });
    });
  });
}

function getDuration(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err: Error | null, metadata?: FFprobeMetadata) => {
      if (err || !metadata?.format?.duration) {
        resolve(null);
        return;
      }
      const duration = parseFloat(metadata.format.duration);
      resolve(isNaN(duration) ? null : duration);
    });
  });
}

interface ExtractAudioOptions {
  onProgress?: (percent: number, timemark: string) => void;
}

async function extractAudio(
  videoPath: string,
  outputPath: string,
  options?: ExtractAudioOptions
): Promise<string> {
  log.debug('Starte Audio-Extraktion:', { inputPath: videoPath, outputPath });

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video-Datei nicht gefunden: ${videoPath}`);
  }

  const duration = await getDuration(videoPath);
  if (duration) {
    log.debug(`Video-Dauer: ${duration.toFixed(1)}s`);
  }

  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath).outputOptions([
      '-vn',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      '-y',
    ]);

    if (duration) {
      command.setDuration(duration);
    }

    command.on('start', (commandLine: string) => {
      log.debug('FFmpeg Befehl:', commandLine);
    });

    command.on('progress', (progress: { percent?: number; timemark?: string }) => {
      const percent =
        progress.percent != null && progress.percent > 0 ? Math.round(progress.percent) : 0;
      const timemark = progress.timemark ?? '';
      if (percent > 0) {
        log.debug('Fortschritt:', percent + '%');
      } else if (timemark) {
        log.debug('Fortschritt:', timemark);
      }
      options?.onProgress?.(percent, timemark);
    });

    command
      .save(outputPath)
      .on('end', () => {
        if (!fs.existsSync(outputPath)) {
          reject(new Error('Audio-Datei wurde nicht erstellt'));
          return;
        }

        const stats = fs.statSync(outputPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        log.debug(`Audio-Extraktion erfolgreich: ${outputPath} (${fileSizeMB} MB)`);

        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        log.error('FFmpeg Fehler:', err);
        reject(err);
      });
  });
}

async function cleanupFiles(...filePaths: (string | null | undefined)[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      if (filePath) {
        const exists = await fsPromises.stat(filePath).catch(() => false);
        if (exists) {
          await fsPromises.unlink(filePath);
          log.debug('Temporäre Datei gelöscht:', filePath);
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        log.warn('Fehler beim Löschen der temporären Datei:', filePath, err);
      }
    }
  }
}

export { getVideoMetadata, extractAudio, cleanupFiles };
export type { VideoMetadata, OriginalFormat };
