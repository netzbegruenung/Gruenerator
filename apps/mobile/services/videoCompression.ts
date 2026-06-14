import { compress, getMetadata, cancel } from 'expo-image-and-video-compressor';

// nginx currently caps /api/ request bodies at 100MB (PR #1253 raises it to
// 500MB but is not deployed yet) — keep uploads safely below the cap. Lower
// this is also just good for mobile upload times.
const TARGET_UPLOAD_BYTES = 90 * 1024 * 1024;
const AUDIO_BITRATE_BUDGET = 128_000;
const MIN_VIDEO_BITRATE = 1_000_000;

export interface CompressionHandle {
  cancellationId: string | null;
}

/**
 * Ensure a reel video fits under the upload size cap. Files already below the
 * target (or without readable duration) are returned untouched; larger ones
 * are re-encoded with hardware encoders (MediaCodec/VideoToolbox) at a
 * bitrate computed from the duration so the output lands below the target.
 *
 * Pass `handle` to enable cancellation via `cancelCompression(handle)`.
 */
export async function ensureUploadableSize(
  fileUri: string,
  onProgress: (percent: number) => void,
  handle?: CompressionHandle
): Promise<string> {
  const meta = await getMetadata(fileUri);
  if (!meta.duration || meta.size <= TARGET_UPLOAD_BYTES) {
    return fileUri;
  }

  const totalBitrate = Math.floor((TARGET_UPLOAD_BYTES * 8) / meta.duration);
  const videoBitrate = Math.max(totalBitrate - AUDIO_BITRATE_BUDGET, MIN_VIDEO_BITRATE);

  return compress(
    fileUri,
    {
      bitrate: videoBitrate,
      maxSize: 1920,
      // h264: widest decoder support for the ffmpeg pipeline + fast HW encode
      codec: 'h264',
      speed: 'fast',
      progressDivider: 1,
      ...(handle
        ? {
            getCancellationId: (id: string) => {
              handle.cancellationId = id;
            },
          }
        : {}),
    },
    (progress) => onProgress(progress * 100)
  );
}

export function cancelCompression(handle: CompressionHandle): void {
  if (handle.cancellationId) {
    cancel(handle.cancellationId);
    handle.cancellationId = null;
  }
}
