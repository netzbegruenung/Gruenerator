/**
 * Rate Limit Status API Routes
 * Provides endpoints for checking rate limit status for any resource type
 * Works for both authenticated and anonymous users
 */

import express, { Request, Response, Router } from 'express';
import { rateLimiter } from '../../middleware/rateLimitMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import type { RequestWithUser } from '../../utils/redis/types.js';

const log = createLogger('rateLimit');
const router: Router = express.Router();

interface RateLimitStatus {
  count: number;
  limit: number;
  remaining: number;
  canGenerate: boolean;
  unlimited: boolean;
  resourceType: string;
  userType: string;
  window?: string;
}

interface LimitConfig {
  window?: string;
}

router.get('/:resourceType', async (req: Request, res: Response) => {
  try {
    const { resourceType } = req.params;

    if (!resourceType || typeof resourceType !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid resource type',
      });
    }

    const userType = rateLimiter.getUserType(req as unknown as RequestWithUser);
    const identifier = rateLimiter.getIdentifier(req as unknown as RequestWithUser, userType);

    const status = (await rateLimiter.checkLimit(
      resourceType,
      identifier,
      userType
    )) as RateLimitStatus;

    const timeUntilReset = status.window ? rateLimiter.getTimeUntilReset(status.window) : null;

    return res.json({
      success: true,
      data: {
        ...status,
        timeUntilReset,
      },
    });
  } catch (error) {
    log.error('[RateLimitAPI] Error getting status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get rate limit status',
    });
  }
});

router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { resourceTypes } = req.body;

    if (!Array.isArray(resourceTypes) || resourceTypes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'resourceTypes must be a non-empty array',
      });
    }

    if (resourceTypes.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 resource types per bulk request',
      });
    }

    const userType = rateLimiter.getUserType(req as unknown as RequestWithUser);
    const identifier = rateLimiter.getIdentifier(req as unknown as RequestWithUser, userType);

    const results: Record<string, RateLimitStatus & { timeUntilReset: string | null }> = {};

    for (const resourceType of resourceTypes) {
      if (typeof resourceType !== 'string') {
        log.warn(`[RateLimitAPI] Skipping invalid resource type: ${resourceType}`);
        continue;
      }

      const status = (await rateLimiter.checkLimit(
        resourceType,
        identifier,
        userType
      )) as RateLimitStatus;
      const timeUntilReset = status.window ? rateLimiter.getTimeUntilReset(status.window) : null;

      results[resourceType] = {
        ...status,
        timeUntilReset,
      };
    }

    return res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    log.error('[RateLimitAPI] Error in bulk status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get bulk rate limit status',
    });
  }
});

router.post('/reset/:resourceType', async (req: Request, res: Response) => {
  try {
    const { resourceType } = req.params;

    const userType = rateLimiter.getUserType(req as unknown as RequestWithUser);
    const identifier = rateLimiter.getIdentifier(req as unknown as RequestWithUser, userType);

    if (process.env.NODE_ENV === 'production' && userType === 'anonymous') {
      return res.status(403).json({
        success: false,
        error: 'Anonymous users cannot reset counters in production',
      });
    }

    const limitConfig = rateLimiter.getLimitConfig(resourceType, userType) as LimitConfig | null;
    const window = limitConfig?.window || 'daily';

    const success = await rateLimiter.resetUserCounter(resourceType, identifier, window);

    if (success) {
      return res.json({
        success: true,
        message: `Counter reset successfully for ${resourceType}`,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to reset counter',
      });
    }
  } catch (error) {
    log.error('[RateLimitAPI] Error resetting counter:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset counter',
    });
  }
});

if (process.env.NODE_ENV === 'development') {
  router.get('/config/:resourceType', (req: Request, res: Response) => {
    const { resourceType } = req.params;
    const userType = rateLimiter.getUserType(req as unknown as RequestWithUser);
    const config = rateLimiter.getLimitConfig(resourceType, userType);

    res.json({
      success: true,
      data: {
        resourceType,
        userType,
        config: config || 'No configuration found',
        allConfigs: (rateLimiter as unknown as { config: { resources: Record<string, unknown> } })
          .config.resources[resourceType],
      },
    });
  });
}

export default router;
