/**
 * Duration probing for the provider policy.
 *
 * Deliberately reads `format.duration` (the container) rather than a video
 * stream's: the input here is usually extracted audio with no video stream at
 * all, which is exactly what makes subtitler's `getVideoMetadata` unusable —
 * it rejects with 'Kein Video-Stream gefunden'.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { ffprobe } from '../subtitler/ffmpegWrapper.js';

/**
 * Returns the media length in seconds, or null when it cannot be determined
 * (unreadable file, no duration in the container). Callers treat null as
 * "assume long" — see chooseProvider.
 */
export async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const metadata = await ffprobe(filePath);
    const raw = metadata?.format?.duration;
    if (!raw) return null;
    const duration = parseFloat(raw);
    return Number.isNaN(duration) ? null : duration;
  } catch {
    return null;
  }
}

/**
 * Same, for the buffer-based voice entry points. ffprobe needs a seekable
 * input, so the buffer takes a short detour through a temp file — the voice
 * pipeline already does this for video uploads.
 */
export async function probeBufferDurationSeconds(
  buffer: Buffer,
  filename: string
): Promise<number | null> {
  let dir: string | null = null;
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-audio-'));
    const filePath = path.join(dir, path.basename(filename) || 'audio');
    await fs.writeFile(filePath, buffer);
    return await probeDurationSeconds(filePath);
  } catch {
    return null;
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
