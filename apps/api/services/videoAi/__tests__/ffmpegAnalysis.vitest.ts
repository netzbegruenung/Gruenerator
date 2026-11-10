import { describe, expect, it } from 'vitest';

import {
  BLUR_THRESHOLD,
  parseFrameSamples,
  parseLoudness,
  parseSceneCuts,
  parseSilences,
  qualityRanges,
} from '../ffmpegAnalysis.js';

import { fixture } from './fixtures.js';

describe('audio pass (real ffmpeg 6.0 output)', () => {
  const stderr = fixture('audio-pass.stderr.txt');

  it('reads every pause', () => {
    const silences = parseSilences(stderr, 68.64);
    expect(silences[0]).toEqual({ start: 0, end: 1.51325 });
    expect(silences.at(-1)).toEqual({ start: 67.4786, end: 68.6507 });
    expect(silences.every((s) => s.end > s.start)).toBe(true);
  });

  it('closes a pause that runs to the end of the clip', () => {
    expect(parseSilences('[silencedetect @ 0x0] silence_start: 9.5', 12)).toEqual([
      { start: 9.5, end: 12 },
    ]);
  });

  it('reads integrated loudness and range from the summary', () => {
    expect(parseLoudness(stderr)).toEqual({ integratedLufs: -17.4, lra: 8.7 });
  });
});

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
