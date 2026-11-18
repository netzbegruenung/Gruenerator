import { describe, expect, it } from 'vitest';

import {
  BLUR_THRESHOLD,
  parseFrameSamples,
  parseSceneCuts,
  qualityRanges,
} from '../ffmpegAnalysis.js';

import { fixture } from './fixtures.js';

describe('video pass (real ffmpeg 6.0 output)', () => {
  const stderr = fixture('video-pass.stderr.txt');

  it('reads scene cuts', () => {
    expect(parseSceneCuts(stderr)).toEqual([3.3, 6.6, 11]);
  });

  it('merges a cut reported twice', () => {
    const doubled = 'lavfi.scd.time: 14.08\nlavfi.scd.time: 14.24\nlavfi.scd.time: 35.92';
    expect(parseSceneCuts(doubled)).toEqual([14.08, 35.92]);
  });

  it('reads sharpness and brightness per sample', () => {
    const samples = parseFrameSamples(stderr);
    expect(samples).toHaveLength(8);
    expect(samples[0]).toEqual({ t: 0, blur: expect.any(Number), yavg: expect.any(Number) });
    expect(samples.every((s) => s.blur !== null && s.blur < BLUR_THRESHOLD)).toBe(true);
  });
});

describe('qualityRanges', () => {
  const sample = (t: number, blur: number, yavg = 80) => ({ t, blur, yavg });

  it('merges consecutive blurred samples into one range', () => {
    const samples = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => sample(t, t >= 1 && t <= 2.5 ? 12 : 5));
    expect(qualityRanges(samples)).toEqual([{ start: 1, end: 3, flag: 'unscharf' }]);
  });

  it('ignores a single bad frame and flags dark stretches', () => {
    const samples = [0, 0.5, 1, 1.5, 2, 2.5].map((t) =>
      sample(t, t === 0.5 ? 12 : 5, t >= 1 ? 20 : 80)
    );
    expect(qualityRanges(samples)).toEqual([{ start: 1, end: 3, flag: 'dunkel' }]);
  });
});
