/**
 * Splits an audio file into fixed-length chunks so each chunk stays under a
 * provider's per-call duration ceiling (see MAX_AUDIO_MINUTES in
 * @gruenerator/contracts). Re-encodes to the same mono/16kHz mp3 shape the
 * video-audio extraction path already uses, so downstream transcription
 * providers see a consistent input regardless of the original container.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createLogger } from '../../utils/logger.js';
import { ffmpeg } from '../subtitler/ffmpegWrapper.js';

const log = createLogger('audioSplitter');

export interface AudioChunk {
  path: string;
  startSeconds: number;
}

export async function splitAudioIntoChunks(
  filePath: string,
  chunkSeconds: number,
  totalDurationSeconds: number
): Promise<{ chunks: AudioChunk[]; tmpDir: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-split-'));
  const chunkCount = Math.max(1, Math.ceil(totalDurationSeconds / chunkSeconds));
  const chunks: AudioChunk[] = [];

  try {
    for (let i = 0; i < chunkCount; i++) {
      const startSeconds = i * chunkSeconds;
      const outputPath = path.join(tmpDir, `chunk-${i}.mp3`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .inputOptions(['-ss', String(startSeconds)])
          .outputOptions([
            '-t',
            String(chunkSeconds),
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
          ])
          .save(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });

      log.debug(`Split chunk ${i + 1}/${chunkCount} @${startSeconds}s -> ${outputPath}`);
      chunks.push({ path: outputPath, startSeconds });
    }
  } catch (err) {
    // The caller only ever sees tmpDir on success — clean up the chunks
    // already written before rethrowing, or they leak until reboot.
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  return { chunks, tmpDir };
}
