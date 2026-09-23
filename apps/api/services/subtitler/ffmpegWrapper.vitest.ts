import { execFileSync } from 'child_process';
import fs from 'fs';

import { describe, expect, it } from 'vitest';

import { ffmpegPath, ffprobePath } from './ffmpegWrapper.js';

/**
 * Both binaries reach the image through an npm INSTALL SCRIPT, not through the
 * tarball: ffmpeg-static downloads ffmpeg, @ffprobe-installer/<platform> chmods
 * the ffprobe it ships. `allowBuilds` in pnpm-workspace.yaml can switch those
 * scripts off, and when it did (2026-09-16) nothing went red — the one test
 * that touched ffmpeg skipped itself on a missing binary. So assert the binary
 * is there AND runnable: missing is ENOENT, present-but-not-executable is
 * EACCES, and only the version call proves it is neither.
 */
describe('ffmpeg/ffprobe binaries', () => {
  it.each([
    ['ffmpeg', ffmpegPath],
    ['ffprobe', ffprobePath],
  ])('ships %s as an executable that runs', (name, binary) => {
    expect(fs.existsSync(binary), `${name} missing at ${binary}`).toBe(true);
    expect(() => fs.accessSync(binary, fs.constants.X_OK), `${name} not executable`).not.toThrow();
    expect(execFileSync(binary, ['-version'], { encoding: 'utf8' })).toContain(`${name} version`);
  });
});
