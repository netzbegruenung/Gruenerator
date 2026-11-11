/**
 * Contact sheets: still frames of a clip in a 3×3 grid, one image per model
 * call. One image per call is the path measured on Gemma 31B (several images
 * per turn are unverified, gemmaHosts.ts); on two sheets it read shot size,
 * person count, horizontal position and burned-in text 9/9, at about 530
 * prompt tokens and 3–4 s per sheet (spike 2026-11-10, section 3).
 */
import { spawn } from 'child_process';

import sharp from 'sharp';

import { ffmpegPool } from '../subtitler/ffmpegPool.js';
import { ffmpegPath } from '../subtitler/ffmpegWrapper.js';

export const CELLS_PER_SHEET = 9;
const GRID = 3;
const CELL_WIDTH = 512;
/** Base interval; longer clips spread MAX_SAMPLES evenly instead. */
const SAMPLE_INTERVAL_SECONDS = 3;
/** 5 sheets per clip at most: the position of a speaker rarely changes. */
export const MAX_SAMPLES_PER_CLIP = 45;
/** A scene cut closer than this to a grid sample replaces it. */
const MERGE_SECONDS = 1;

export interface ContactSheet {
  /** Sample time of each cell, in reading order. */
  times: number[];
  jpeg: Buffer;
}

/**
 * Scene cuts first (a new shot is worth a look), then a regular grid filling
 * the gaps. Frames 0.1 s after a cut, not on it: the cut frame is often a
 * blend of both shots.
 */
export function sampleTimes(duration: number, sceneCuts: readonly number[]): number[] {
  const interval = Math.max(SAMPLE_INTERVAL_SECONDS, duration / MAX_SAMPLES_PER_CLIP);
  const times = sceneCuts.map((c) => Math.min(c + 0.1, duration - 0.05));
  for (let t = Math.min(0.5, duration / 2); t < duration; t += interval) {
    if (!times.some((s) => Math.abs(s - t) < MERGE_SECONDS)) times.push(t);
  }
  return times
    .filter((t) => t >= 0 && t < duration)
    .sort((a, b) => a - b)
    .slice(0, MAX_SAMPLES_PER_CLIP)
    .map((t) => Math.round(t * 100) / 100);
}

function grabFrame(path: string, t: number): Promise<Buffer> {
  return ffmpegPool.run(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        const proc = spawn(ffmpegPath, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          String(t),
          '-i',
          path,
          '-frames:v',
          '1',
          '-vf',
          `scale=${CELL_WIDTH}:-2`,
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
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
          const frame = Buffer.concat(chunks);
          if (code === 0 && frame.length > 0) resolve(frame);
          else reject(new Error(`frame at ${t}s failed (${code}): ${stderr.slice(-300)}`));
        });
      }),
    'video-ai-frame'
  );
}

export async function buildContactSheets(
  path: string,
  times: readonly number[]
): Promise<ContactSheet[]> {
  const sheets: ContactSheet[] = [];
  for (let i = 0; i < times.length; i += CELLS_PER_SHEET) {
    const chunk = times.slice(i, i + CELLS_PER_SHEET);
    const frames = await Promise.all(chunk.map((t) => grabFrame(path, t)));
    const meta = await sharp(frames[0]).metadata();
    const cellHeight = Math.round(
      ((meta.height ?? CELL_WIDTH) / (meta.width ?? CELL_WIDTH)) * CELL_WIDTH
    );
    const rows = Math.ceil(chunk.length / GRID);
    const jpeg = await sharp({
      create: {
        width: CELL_WIDTH * GRID,
        height: cellHeight * rows,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(
        await Promise.all(
          frames.map(async (frame, k) => ({
            input: await sharp(frame).resize(CELL_WIDTH, cellHeight, { fit: 'cover' }).toBuffer(),
            left: (k % GRID) * CELL_WIDTH,
            top: Math.floor(k / GRID) * cellHeight,
          }))
        )
      )
      .jpeg({ quality: 80 })
      .toBuffer();
    sheets.push({ times: chunk, jpeg });
  }
  return sheets;
}
