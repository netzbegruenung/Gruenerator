import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { recordOperation } from '../usage/UsageTrackingService.js';
import { AudioEnhanceError, enhanceSpeech } from '../voice/enhanceService.js';

import { ffmpegPool } from './ffmpegPool.js';
import { ffmpeg, ffprobe } from './ffmpegWrapper.js';

export const ENHANCE_MAX_SECONDS = 300;
/** The extracted WAV is mono pcm_s16le at 24 kHz. */
const PCM_BYTES_PER_SECOND = 24_000 * 2;
const WAV_HEADER_BYTES = 44;

function assertShortEnough(seconds: number): void {
  if (Number.isFinite(seconds) && seconds > ENHANCE_MAX_SECONDS) {
    throw new AudioEnhanceError(
      'too_long',
      null,
      `Ton verbessern geht bei Videos bis ${ENHANCE_MAX_SECONDS} Sekunden.`
    );
  }
}

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
  outputPath: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ durationSeconds: number }> {
  const meta = await ffprobe(inputPath).catch(() => {
    throw new AudioEnhanceError('invalid_input', null, 'ffprobe could not read the file');
  });
  if (!meta.streams.some((s) => s.codec_type === 'audio')) {
    throw new AudioEnhanceError('no_audio', null, 'Das Video hat keine Tonspur.');
  }
  // Cheap early exit; containers without a duration header are caught after
  // extraction, where the WAV's own length is exact.
  assertShortEnough(Number(meta.format.duration));

  let durationSeconds = 0;
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
    ).catch(() => {
      throw new AudioEnhanceError('invalid_input', null, 'ffmpeg could not extract the audio');
    });

    const wav = await fs.readFile(rawWav);
    durationSeconds = Math.max(0, wav.length - WAV_HEADER_BYTES) / PCM_BYTES_PER_SECOND;
    assertShortEnough(durationSeconds);
    if (durationSeconds <= 0) {
      throw new AudioEnhanceError('no_audio', null, 'Das Video hat keine Tonspur.');
    }

    const enhanced = await enhanceSpeech(wav, options);
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
