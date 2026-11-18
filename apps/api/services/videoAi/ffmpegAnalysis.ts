/**
 * Deterministic footage analysis with the bundled ffmpeg 6.0: scene cuts,
 * sharpness, brightness. The parsers are pure and tested against real ffmpeg
 * output; `analyzeClip` runs the video pass.
 *
 * Measured 2026-11-10 on an M5, 100 s of 1080×1920 (spike, section 2):
 * scene pass 1 s, sharpness at 2 fps 6 s.
 */
import { spawn, type ChildProcess } from 'child_process';

import { ffmpegPool } from '../subtitler/ffmpegPool.js';
import { ffmpegPath } from '../subtitler/ffmpegWrapper.js';

export interface TimeRange {
  start: number;
  end: number;
}

export interface FrameSample {
  t: number;
  /** blurdetect at 480 px width: sharp footage 3–6. */
  blur: number | null;
  /** signalstats luma average, 0–255 (TV black is 16). */
  yavg: number | null;
}

export type QualityFlag = 'unscharf' | 'dunkel';

export interface QualityRange extends TimeRange {
  flag: QualityFlag;
}

export interface ClipAnalysis {
  sceneCuts: number[];
  quality: QualityRange[];
}

/**
 * blurdetect at 480 px over the same 20 s with added Gaussian blur:
 * σ 0 → 5.3, σ 2 → 7.2, σ 4 → 9.5, σ 8 → 17.1 (median). 8.5 sits between
 * "slightly soft" and "visibly blurred".
 */
export const BLUR_THRESHOLD = 8.5;
/** Luma average below this reads as underexposed. */
export const DARK_YAVG_THRESHOLD = 40;
/** scdet reports one cut twice, 0.16 s apart (spike); merge closer cuts. */
export const SCENE_CUT_MIN_GAP = 0.5;
/** A flagged stretch shorter than this is a single bad frame, not a problem. */
const MIN_QUALITY_RANGE = 1;

export function parseSceneCuts(stderr: string, minGap = SCENE_CUT_MIN_GAP): number[] {
  const cuts: number[] = [];
  for (const m of stderr.matchAll(/lavfi\.scd\.time: ([\d.]+)/g)) {
    const t = Number(m[1]);
    const last = cuts[cuts.length - 1];
    if (last === undefined || t - last >= minGap) cuts.push(t);
  }
  return cuts;
}

/** Output of `metadata=print`: a `frame:… pts_time:…` line, then key=value lines. */
export function parseFrameSamples(text: string): FrameSample[] {
  const samples: FrameSample[] = [];
  let current: FrameSample | null = null;
  for (const line of text.split('\n')) {
    const frame = /pts_time:([\d.]+)/.exec(line);
    if (frame) {
      current = { t: Number(frame[1]), blur: null, yavg: null };
      samples.push(current);
      continue;
    }
    if (!current) continue;
    const blur = /lavfi\.blur=([\d.]+)/.exec(line);
    if (blur) current.blur = Number(blur[1]);
    const yavg = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(line);
    if (yavg) current.yavg = Number(yavg[1]);
  }
  return samples;
}

/**
 * Merges consecutive flagged samples into ranges. A sample covers the time up
 * to the next one; ranges shorter than MIN_QUALITY_RANGE are dropped.
 */
export function qualityRanges(samples: readonly FrameSample[]): QualityRange[] {
  const ranges: QualityRange[] = [];
  for (const flag of ['unscharf', 'dunkel'] as const) {
    let open: QualityRange | null = null;
    samples.forEach((s, i) => {
      const bad =
        flag === 'unscharf'
          ? s.blur !== null && s.blur > BLUR_THRESHOLD
          : s.yavg !== null && s.yavg < DARK_YAVG_THRESHOLD;
      const end = samples[i + 1]?.t ?? s.t + (s.t - (samples[i - 1]?.t ?? s.t));
      if (bad) {
        if (open) open.end = end;
        else open = { start: s.t, end, flag };
      } else if (open) {
        ranges.push(open);
        open = null;
      }
    });
    if (open) ranges.push(open);
  }
  return ranges
    .filter((r) => r.end - r.start >= MIN_QUALITY_RANGE)
    .sort((a, b) => a.start - b.start);
}

/** Per-call limits: a hung ffmpeg must not hold a job (videoAiWorker JOB_BUDGET_MS). */
export const FFMPEG_LIMITS_MS = {
  /** Proxy transcode and the video analysis pass: about ten times realtime. */
  pass: 20 * 60 * 1000,
  speechAudio: 5 * 60 * 1000,
  frame: 60 * 1000,
} as const;

/**
 * The one kill timeout of the ffmpeg spawns: `settle` wires the caller's own
 * stdout/stderr handling; if neither callback ran within `limitMs`, the
 * process gets SIGKILL and the promise rejects. Late callbacks are ignored.
 */
export function settleWithin<T>(
  proc: Pick<ChildProcess, 'kill'>,
  limitMs: number,
  label: string,
  settle: (resolve: (value: T) => void, reject: (error: Error) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      proc.kill('SIGKILL');
      reject(
        new Error(`ffmpeg ${label} took longer than ${Math.round(limitMs / 1000)} s and was killed`)
      );
    }, limitMs);
    const finish = (): boolean => {
      if (done) return false;
      done = true;
      clearTimeout(timer);
      return true;
    };
    settle(
      (value) => {
        if (finish()) resolve(value);
      },
      (error) => {
        if (finish()) reject(error);
      }
    );
  });
}

export function runCapture(args: string[], label: string, limitMs: number): Promise<string> {
  return ffmpegPool.run(() => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-nostats', ...args]);
    return settleWithin<string>(proc, limitMs, label, (resolve, reject) => {
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve(stderr);
        else reject(new Error(`ffmpeg ${label} exited with ${code}: ${stderr.slice(-500)}`));
      });
    });
  }, label);
}

/** Runs the video pass on one clip (ideally the proxy). */
export async function analyzeClip(path: string): Promise<ClipAnalysis> {
  const video = await runCapture(
    [
      '-i',
      path,
      '-an',
      '-filter_complex',
      '[0:v]split[a][b];[a]scdet=threshold=10,nullsink;' +
        '[b]fps=2,scale=480:-2,blurdetect=block_width=32:block_height=32,signalstats,metadata=print[out]',
      '-map',
      '[out]',
      '-f',
      'null',
      '-',
    ],
    'video-ai-video',
    FFMPEG_LIMITS_MS.pass
  );
  return {
    sceneCuts: parseSceneCuts(video),
    quality: qualityRanges(parseFrameSamples(video)),
  };
}
