import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { recordOperation } from '../usage/UsageTrackingService.js';
import { AudioEnhanceError, enhanceSpeech } from '../voice/enhanceService.js';

import { ffmpegPool } from './ffmpegPool.js';
import { ffmpeg, ffprobe } from './ffmpegWrapper.js';

export const ENHANCE_MAX_SECONDS = 300;

function runFfmpeg(build: () => ReturnType<typeof ffmpeg>, output: string): Promise<void> {
  return ffmpegPool.run(
    () =>
      new Promise<void>((resolve, reject) => {
        build()
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .save(output);
      }),
    'audio-enhance'
  );
}

/**
 * Replaces a video's audio with a noise-reduced version, keeping the video
 * stream untouched. Length and audio checks run before the provider is called,
 * so a rejected clip costs nothing.
 */
export async function enhanceVideoAudio(
  inputPath: string,
  outputPath: string
): Promise<{ durationSeconds: number }> {
  const meta = await ffprobe(inputPath);
  if (!meta.streams.some((s) => s.codec_type === 'audio')) {
    throw new AudioEnhanceError('no_audio', null, 'Das Video hat keine Tonspur.');
  }
  const durationSeconds = Number(meta.format.duration ?? 0);
  if (durationSeconds > ENHANCE_MAX_SECONDS) {
    throw new AudioEnhanceError(
      'too_long',
      null,
      `Ton verbessern geht bei Videos bis ${ENHANCE_MAX_SECONDS} Sekunden.`
    );
  }

  const id = crypto.randomUUID();
  const rawWav = `${outputPath}.${id}.in.wav`;
  const enhancedWav = `${outputPath}.${id}.out.wav`;

  try {
    await runFfmpeg(
      () =>
        ffmpeg(inputPath).outputOptions([
          '-y',
          '-vn',
          '-ac',
          '1',
          '-ar',
          '24000',
          '-c:a',
          'pcm_s16le',
        ]),
      rawWav
    );

    const enhanced = await enhanceSpeech(await fs.readFile(rawWav));
    await fs.writeFile(enhancedWav, enhanced);

    // Billed per started second of input, so the count is rounded up.
    recordOperation({
      unit: 'speech_seconds',
      provider: 'kugelaudio',
      model: 'clarity-1',
      feature: 'audio_enhance',
      count: Math.ceil(durationSeconds),
    });

    await runFfmpeg(
      () =>
        ffmpeg(inputPath)
          .input(enhancedWav)
          .outputOptions([
            '-y',
            '-map',
            '0:v:0?',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '160k',
            '-movflags',
            '+faststart',
          ]),
      outputPath
    );
  } finally {
    await Promise.all([fs.rm(rawWav, { force: true }), fs.rm(enhancedWav, { force: true })]);
  }

  return { durationSeconds };
}
