import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, describe, expect, it } from 'vitest';

import { buildFFmpegOutputOptions } from './ffmpegExportUtils.js';
import { ffmpegPath, ffprobePath } from './ffmpegWrapper.js';

/**
 * `-avoid_negative_ts make_zero` shifted the B-frame decode delay of x264 into
 * the presentation timeline: the first frame landed at ~0.066 s and the mp4
 * muxer filled the gap with an empty edit. Apple players (iOS Photos,
 * QuickTime) and the apps people upload reels to show that gap as a black
 * frame at the start of every export. The muxer handles the delay with a
 * normal edit list on its own, so the video track must start at 0.
 */
describe('buildFFmpegOutputOptions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-start-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('starts the exported video at 0 instead of behind an empty edit', () => {
    const output = path.join(dir, 'out.mp4');
    const { outputOptions } = buildFFmpegOutputOptions({
      metadata: { width: 180, height: 320 },
      fileStats: { size: 1024 },
    });

    execFileSync(ffmpegPath, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=180x320:r=30:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=d=1',
      ...outputOptions,
      '-shortest',
      output,
    ]);

    const starts = execFileSync(
      ffprobePath,
      ['-v', 'error', '-show_entries', 'stream=codec_type,start_time', '-of', 'json', output],
      { encoding: 'utf8' }
    );
    const streams = (
      JSON.parse(starts) as { streams: { codec_type: string; start_time: string }[] }
    ).streams;
    const video = streams.find((s) => s.codec_type === 'video');

    expect(Number(video?.start_time)).toBe(0);
  });
});
