/**
 * ffprobe-backed metadata for export-time video files.
 *
 * Deliberately tolerant: these paths run on files that already passed upload
 * validation, so a missing video stream degrades to 1080p instead of throwing.
 * `videoUploadService.getVideoMetadata` is the strict counterpart — at upload
 * time a file without a video stream is a real error the user must see, so it
 * rejects. Keep the two apart; collapsing them would either break uploads or
 * make exports fail on odd-but-processable files.
 */
import { type VideoMetadata } from '../../routes/subtitler/types.js';

import { ffprobe, normalizeRotation } from './ffmpegWrapper.js';

function parseFrameRate(frameRateStr: string): number {
  if (!frameRateStr) return 30;
  const parts = frameRateStr.split('/');
  if (parts.length === 2) {
    const numerator = parseFloat(parts[0]);
    const denominator = parseFloat(parts[1]);
    if (denominator !== 0) {
      return numerator / denominator;
    }
  }
  const parsed = parseFloat(frameRateStr);
  return isNaN(parsed) ? 30 : parsed;
}

export async function probeVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  const metadata = await ffprobe(inputPath);
  const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
  const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

  const rotationDegrees = videoStream ? normalizeRotation(videoStream) : 0;
  const isVertical = rotationDegrees === 90 || rotationDegrees === 270;
  const rawW = videoStream?.width || 1920;
  const rawH = videoStream?.height || 1080;

  return {
    width: isVertical ? rawH : rawW,
    height: isVertical ? rawW : rawH,
    duration: parseFloat(metadata.format.duration || '0') || 0,
    fps: parseFrameRate(videoStream?.r_frame_rate || '30/1'),
    rotation: String(rotationDegrees),
    originalFormat: {
      ...(videoStream?.codec_name && { codec: videoStream.codec_name }),
      ...(audioStream?.codec_name && { audioCodec: audioStream.codec_name }),
      audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 : null,
      videoBitrate: videoStream?.bit_rate ? parseInt(videoStream.bit_rate) : null,
    },
  };
}
