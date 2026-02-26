/**
 * Remotion Render Worker
 *
 * Polls Redis for render jobs, bundles the Remotion project once,
 * then renders each job using renderMedia(). Updates job progress
 * in Redis so the API can poll it.
 */

import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import Redis from 'ioredis';

import type { RenderJob } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '../output');
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const RENDER_JOB_PREFIX = 'video-render';
const RENDER_QUEUE_KEY = 'video-render:queue';
const RENDER_JOB_TTL = 24 * 60 * 60;

const redis = new Redis(REDIS_URL);

function log(level: string, message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${level.toUpperCase()} [remotion-worker] ${message}`);
}

async function ensureOutputDir(): Promise<void> {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

async function updateJob(jobId: string, updates: Partial<RenderJob>): Promise<void> {
  const data = await redis.get(`${RENDER_JOB_PREFIX}:${jobId}`);
  if (!data) return;

  const job: RenderJob = JSON.parse(data);
  const updated = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(`${RENDER_JOB_PREFIX}:${jobId}`, JSON.stringify(updated), 'EX', RENDER_JOB_TTL);
}

async function isCancelled(jobId: string): Promise<boolean> {
  const cancel = await redis.get(`${RENDER_JOB_PREFIX}:cancel:${jobId}`);
  return cancel === '1';
}

async function processJob(bundleLocation: string, jobId: string): Promise<void> {
  log('info', `Processing render job: ${jobId}`);

  const data = await redis.get(`${RENDER_JOB_PREFIX}:${jobId}`);
  if (!data) {
    log('warn', `Job not found: ${jobId}`);
    return;
  }

  const job: RenderJob = JSON.parse(data);

  if (await isCancelled(jobId)) {
    log('info', `Job cancelled before start: ${jobId}`);
    return;
  }

  try {
    await updateJob(jobId, { status: 'PROCESSING', progress: 0 });

    const { design, options } = job;

    const inputProps = {
      trackItemIds: design.trackItemIds || [],
      trackItemsMap: design.trackItemsMap || {},
      transitionsMap: design.transitionsMap || {},
      fps: options.fps || 30,
      size: options.size || design.size || { width: 1080, height: 1920 },
      background: design.background,
    };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'VideoExport',
      inputProps,
    });

    const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      onProgress: async ({ progress }) => {
        const percent = Math.round(progress * 100);
        await updateJob(jobId, { progress: percent });

        if (await isCancelled(jobId)) {
          throw new Error('CANCELLED');
        }
      },
    });

    // Make the output accessible via the API
    const outputUrl = `${API_BASE_URL}/api/video/uploads/file/${jobId}.mp4`;

    await updateJob(jobId, {
      status: 'COMPLETED',
      progress: 100,
      presigned_url: outputUrl,
    });

    log('info', `Render complete: ${jobId} → ${outputPath}`);
  } catch (error: any) {
    if (error.message === 'CANCELLED') {
      log('info', `Render cancelled mid-progress: ${jobId}`);
      await updateJob(jobId, {
        status: 'FAILED',
        error: 'Cancelled by user',
      });
    } else {
      log('error', `Render failed for ${jobId}: ${error.message}`);
      await updateJob(jobId, {
        status: 'FAILED',
        error: error.message,
      });
    }
  }
}

async function main(): Promise<void> {
  log('info', 'Remotion render worker starting...');
  log('info', `Redis: ${REDIS_URL}`);
  log('info', `Output: ${OUTPUT_DIR}`);

  await ensureOutputDir();

  log('info', 'Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: path.join(__dirname, 'index.ts'),
    onProgress: (progress: number) => {
      if (progress % 25 === 0) {
        log('info', `Bundle progress: ${progress}%`);
      }
    },
  });
  log('info', `Bundle ready at: ${bundleLocation}`);

  log('info', 'Waiting for render jobs...');

  // Main loop: BRPOP blocks until a job is available
  while (true) {
    try {
      const result = await redis.brpop(RENDER_QUEUE_KEY, 0);
      if (!result) continue;

      const [, jobId] = result;
      await processJob(bundleLocation, jobId);
    } catch (error: any) {
      if (error.message?.includes('Connection is closed')) {
        log('error', 'Redis connection lost, reconnecting...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        log('error', `Worker error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

main().catch((error) => {
  log('error', `Fatal: ${error.message}`);
  process.exit(1);
});
