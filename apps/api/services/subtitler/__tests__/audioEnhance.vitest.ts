/**
 * Enhancing a video's audio: real ffmpeg on tiny lavfi clips, the provider
 * mocked. The guards (no audio, too long) must fire before any provider call.
 *
 * Run: `npx vitest run services/subtitler/__tests__/audioEnhance.vitest.ts`
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../usage/UsageTrackingService.js', () => ({ recordOperation: vi.fn() }));

vi.mock('../../voice/enhanceService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../voice/enhanceService.js')>();
  return { ...actual, enhanceSpeech: vi.fn(async (wav: Buffer) => wav) };
});

const { enhanceVideoAudio } = await import('../audioEnhance.js');
const { AudioEnhanceError, enhanceSpeech } = await import('../../voice/enhanceService.js');
const { recordOperation } = await import('../../usage/UsageTrackingService.js');
const { ffmpegPath, ffprobe } = await import('../ffmpegWrapper.js');

function makeClip(args: string[], out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-y', ...args, out], { stdio: 'ignore' });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg fixture failed (${code})`))
    );
  });
}

let dir = '';
let clipWithSound = '';
let silentVideo = '';
let longClip = '';
let out = '';

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-enhance-'));
  clipWithSound = path.join(dir, 'sound.mp4');
  silentVideo = path.join(dir, 'silent.mp4');
  longClip = path.join(dir, 'long.mp4');
  await makeClip(
    [
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=64x64:rate=5:duration=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
    ],
    clipWithSound
  );
  await makeClip(
    [
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=64x64:rate=5:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
    ],
    silentVideo
  );
  await makeClip(
    [
      '-f',
      'lavfi',
      '-i',
      'color=c=black:size=64x64:rate=1:duration=301',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=8000:cl=mono',
      '-t',
      '301',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '8k',
    ],
    longClip
  );
}, 60_000);

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.mocked(enhanceSpeech).mockClear();
  vi.mocked(recordOperation).mockClear();
  out = path.join(dir, `out-${Math.random().toString(36).slice(2)}.mp4`);
});

describe('enhanceVideoAudio', () => {
  it('keeps the video stream and replaces the audio', async () => {
    const { durationSeconds } = await enhanceVideoAudio(clipWithSound, out);
    const meta = await ffprobe(out);
    expect(meta.streams.find((s) => s.codec_type === 'video')?.codec_name).toBe('h264');
    expect(meta.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
    expect(Math.abs(durationSeconds - 2)).toBeLessThan(0.1);
    expect(enhanceSpeech).toHaveBeenCalledOnce();
    expect(recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2, feature: 'audio_enhance' })
    );
  });

  it('rejects a clip without audio before calling the provider', async () => {
    await expect(enhanceVideoAudio(silentVideo, out)).rejects.toMatchObject({ code: 'no_audio' });
    expect(enhanceSpeech).not.toHaveBeenCalled();
  });

  it('rejects a clip over 300 s before calling the provider', async () => {
    await expect(enhanceVideoAudio(longClip, out)).rejects.toMatchObject({ code: 'too_long' });
    expect(enhanceSpeech).not.toHaveBeenCalled();
  });

  it('removes its temp wavs when the provider fails', async () => {
    vi.mocked(enhanceSpeech).mockRejectedValueOnce(new AudioEnhanceError('unavailable', 503, 'x'));
    await expect(enhanceVideoAudio(clipWithSound, out)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.wav'))).toEqual([]);
  });
});
