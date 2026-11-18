import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BLUR_THRESHOLD,
  parseFrameSamples,
  parseSceneCuts,
  qualityRanges,
  settleWithin,
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

describe('settleWithin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('kills a run that outlives its limit and rejects with the label', async () => {
    vi.useFakeTimers();
    const proc = { kill: vi.fn(() => true) };
    const run = settleWithin<string>(proc, 60_000, 'video-ai-frame', () => {});
    const outcome = run.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(await outcome).toEqual(
      new Error('ffmpeg video-ai-frame took longer than 60 s and was killed')
    );
  });

  it('leaves a run that finishes in time alone', async () => {
    vi.useFakeTimers();
    const proc = { kill: vi.fn(() => true) };
    const ctl: { finish: ((v: string) => void) | null } = { finish: null };
    const run = settleWithin<string>(proc, 60_000, 'video-ai-frame', (resolve) => {
      ctl.finish = resolve;
    });
    await vi.advanceTimersByTimeAsync(30_000);
    ctl.finish?.('ok');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await run).toBe('ok');
    expect(proc.kill).not.toHaveBeenCalled();
  });
});
