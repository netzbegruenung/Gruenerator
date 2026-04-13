/**
 * ts-rest contract router for video render endpoints.
 *
 * Covers:
 *   POST   /api/video/render
 *   GET    /api/video/render/:id
 *   DELETE /api/video/render/:id
 *
 * Mount BEFORE the legacy renderController router in routes.ts so ts-rest
 * matches its own routes first; unmatched paths fall through to the legacy
 * router.
 *
 * All routes require authentication — `requireAuth` is applied at the
 * /api/video prefix in routes.ts.
 */

import crypto from 'crypto';

import { videoContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { parseJSON } from '../../utils/parseJSON.js';
import { redisClient } from '../../utils/redis/index.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('videoContractRouter');

const RENDER_JOB_PREFIX = 'video-render';
const RENDER_JOB_TTL = 24 * 60 * 60; // 24 hours
const RENDER_QUEUE_KEY = 'video-render:queue';

interface RenderJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  design: Record<string, unknown>;
  options: {
    fps: number;
    size: { width: number; height: number };
    format: string;
  };
  userId: string;
  createdAt: string;
  updatedAt: string;
  presigned_url?: string;
  error?: string;
}

function jobKey(id: string): string {
  return `${RENDER_JOB_PREFIX}:${id}`;
}

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  return user?.id ?? 'anonymous';
}

const s = initServer();

export const videoContractRouter = s.router(videoContract, {
  createRender: async (args) => {
    const { design, options } = args.body;

    if (!design) {
      return { status: 400 as const, body: { error: 'design payload is required' } };
    }

    try {
      const id = crypto.randomUUID();
      const userId = getUserId(args.req);

      const job: RenderJob = {
        id,
        status: 'PENDING',
        progress: 0,
        design,
        options: {
          fps: options?.fps ?? 30,
          size: options?.size ??
            (design.size as { width: number; height: number } | undefined) ?? {
              width: 1080,
              height: 1920,
            },
          format: options?.format ?? 'mp4',
        },
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await redisClient.set(jobKey(id), JSON.stringify(job), { EX: RENDER_JOB_TTL });
      await redisClient.lPush(RENDER_QUEUE_KEY, id);

      log.info(`Render job created: ${id} by user ${userId}`);

      return { status: 200 as const, body: { render: { id } } };
    } catch (error: unknown) {
      log.error(
        `[videoContract.createRender] Failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { status: 500 as const, body: { error: 'Failed to create render job' } };
    }
  },

  getRender: async (args) => {
    const { id } = args.params;

    try {
      const data = await redisClient.get(jobKey(id));

      if (!data) {
        return { status: 404 as const, body: { error: 'Render job not found' } };
      }

      const job = parseJSON<RenderJob>(data);

      return {
        status: 200 as const,
        body: {
          render: {
            id: job.id,
            status: job.status,
            progress: job.progress,
            ...(job.presigned_url != null && { presigned_url: job.presigned_url }),
            ...(job.error != null && { error: job.error }),
          },
        },
      };
    } catch (error: unknown) {
      log.error(
        `[videoContract.getRender] Failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { status: 500 as const, body: { error: 'Failed to get render status' } };
    }
  },

  cancelRender: async (args) => {
    const { id } = args.params;

    try {
      const data = await redisClient.get(jobKey(id));

      if (!data) {
        return { status: 404 as const, body: { error: 'Render job not found' } };
      }

      const job = parseJSON<RenderJob>(data);

      if (job.status === 'COMPLETED') {
        return { status: 400 as const, body: { error: 'Cannot cancel a completed render' } };
      }

      await redisClient.set(`${RENDER_JOB_PREFIX}:cancel:${id}`, '1', { EX: 300 });

      job.status = 'FAILED';
      job.error = 'Cancelled by user';
      job.updatedAt = new Date().toISOString();
      await redisClient.set(jobKey(id), JSON.stringify(job), { EX: RENDER_JOB_TTL });

      log.info(`Render job cancelled: ${id}`);
      return { status: 200 as const, body: { success: true } };
    } catch (error: unknown) {
      log.error(
        `[videoContract.cancelRender] Failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { status: 500 as const, body: { error: 'Failed to cancel render' } };
    }
  },
});

/**
 * Mount the ts-rest video contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy renderController router.
 */
export function mountVideoContractRouter(app: Application): void {
  createExpressEndpoints(videoContract, videoContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'videoContract'),
  });
}
