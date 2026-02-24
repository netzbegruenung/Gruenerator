/**
 * Video Render Controller
 *
 * Manages render jobs for the video editor.
 * Accepts the full IDesign state, queues a render job in Redis,
 * and allows polling for progress. The actual rendering is performed
 * by the Remotion render service (services/remotion).
 */

import crypto from 'crypto';

import { Router, type Response } from 'express';

import { type AuthenticatedRequest } from '../../middleware/types.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

const log = createLogger('video-render');
const router = Router();

const RENDER_JOB_PREFIX = 'video-render';
const RENDER_JOB_TTL = 24 * 60 * 60; // 24 hours
const RENDER_QUEUE_KEY = 'video-render:queue';

interface RenderJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  design: any;
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

/**
 * POST /api/video/render
 *
 * Creates a new render job. Stores the full design state in Redis
 * and pushes the job ID to a queue for the Remotion worker to pick up.
 *
 * Request body: { design: IDesign, options: { fps, size, format } }
 * Response: { render: { id: string } }
 */
router.post('/render', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { design, options } = req.body;

  if (!design) {
    res.status(400).json({ error: 'design payload is required' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    const userId = req.user?.id || 'anonymous';

    const job: RenderJob = {
      id,
      status: 'PENDING',
      progress: 0,
      design,
      options: {
        fps: options?.fps || 30,
        size: options?.size || design.size || { width: 1080, height: 1920 },
        format: options?.format || 'mp4',
      },
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store job data in Redis
    await redisClient.set(jobKey(id), JSON.stringify(job), { EX: RENDER_JOB_TTL });

    // Push to queue for the Remotion worker
    await redisClient.lPush(RENDER_QUEUE_KEY, id);

    log.info(`Render job created: ${id} by user ${userId}`);

    res.json({
      render: { id },
    });
  } catch (error: any) {
    log.error(`Failed to create render job: ${error.message}`);
    res.status(500).json({ error: 'Failed to create render job' });
  }
});

/**
 * GET /api/video/render/:id
 *
 * Polls for render job status. Returns progress percentage
 * and, when complete, the URL to the rendered video.
 *
 * Response: { render: { id, status, progress, presigned_url? } }
 */
router.get(
  '/render/:id',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const data = await redisClient.get(jobKey(id));

      if (!data) {
        res.status(404).json({ error: 'Render job not found' });
        return;
      }

      const job: RenderJob = JSON.parse(data);

      res.json({
        render: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          presigned_url: job.presigned_url,
          error: job.error,
        },
      });
    } catch (error: any) {
      log.error(`Failed to get render status: ${error.message}`);
      res.status(500).json({ error: 'Failed to get render status' });
    }
  }
);

/**
 * DELETE /api/video/render/:id
 *
 * Cancels a render job if it hasn't completed yet.
 */
router.delete(
  '/render/:id',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const data = await redisClient.get(jobKey(id));

      if (!data) {
        res.status(404).json({ error: 'Render job not found' });
        return;
      }

      const job: RenderJob = JSON.parse(data);

      if (job.status === 'COMPLETED') {
        res.status(400).json({ error: 'Cannot cancel a completed render' });
        return;
      }

      // Set cancel flag for the worker to detect
      await redisClient.set(`${RENDER_JOB_PREFIX}:cancel:${id}`, '1', { EX: 300 });

      job.status = 'FAILED';
      job.error = 'Cancelled by user';
      job.updatedAt = new Date().toISOString();
      await redisClient.set(jobKey(id), JSON.stringify(job), { EX: RENDER_JOB_TTL });

      log.info(`Render job cancelled: ${id}`);
      res.json({ success: true });
    } catch (error: any) {
      log.error(`Failed to cancel render: ${error.message}`);
      res.status(500).json({ error: 'Failed to cancel render' });
    }
  }
);

export default router;
