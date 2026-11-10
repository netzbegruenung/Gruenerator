/**
 * The working copy every later step reads: H.264 at 30 fps constant frame
 * rate, longest side at most 1920 px, rotation applied, sound cleaned up and
 * levelled. One pass solves HEVC from phones, variable frame rate (which
 * drifts out of sync once cut), 4K load in the browser editor, and the noisy
 * phone microphone. Measured on the M5: about ten times realtime.
 *
 * Loudness is normalised in one pass (dynamic `loudnorm`), not two: the second
 * pass would decode the clip once more for a difference nobody hears in speech.
 */
import { spawn } from 'child_process';

import { ffmpegPool } from '../subtitler/ffmpegPool.js';
import { ffmpegPath } from '../subtitler/ffmpegWrapper.js';

import { runCapture } from './ffmpegAnalysis.js';

export const PROXY_MAX_SIDE = 1920;
export const PROXY_FPS = 30;
/** Streaming loudness for social video. */
export const PROXY_LUFS = -14;

export function proxyArgs(input: string, output: string): string[] {
  const side = PROXY_MAX_SIDE;
  return [
    '-y',
    '-i',
    input,
    '-vf',
    `scale=w='if(gte(iw,ih),min(${side},iw),-2)':h='if(gte(iw,ih),-2,min(${side},ih))',` +
      `fps=${PROXY_FPS},format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    // A keyframe every second keeps seeking in the browser editor cheap.
    '-g',
    String(PROXY_FPS),
    '-af',
    `highpass=f=80,afftdn=nf=-25,loudnorm=I=${PROXY_LUFS}:TP=-1.5:LRA=11`,
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    output,
  ];
}

export async function transcodeProxy(input: string, output: string): Promise<void> {
  await runCapture(proxyArgs(input, output), 'video-ai-proxy');
}

/** Mono MP3 for the transcription: small enough for one upload of fifteen minutes. */
export function speechAudio(input: string): Promise<Buffer> {
  return ffmpegPool.run(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        const proc = spawn(ffmpegPath, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          input,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '64k',
          '-f',
          'mp3',
          '-',
        ]);
        const chunks: Buffer[] = [];
        let stderr = '';
        proc.stdout.on('data', (c: Buffer) => chunks.push(c));
        proc.stderr.on('data', (c: Buffer) => {
          stderr += c.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          const audio = Buffer.concat(chunks);
          if (code === 0 && audio.length > 0) resolve(audio);
          else reject(new Error(`speech audio failed (${code}): ${stderr.slice(-300)}`));
        });
      }),
    'video-ai-speech'
  );
}
