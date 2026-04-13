/**
 * Rate Limit Status API Routes
 * Provides endpoints for checking rate limit status for any resource type
 * Works for both authenticated and anonymous users
 */

import express, { type Response, type Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { rateLimiter } from '../../middleware/rateLimitMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { createLogger } from '../../utils/logger.js';
import { getParam } from '../../utils/params.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { RequestWithUser } from '../../utils/redis/types.js';

type ReqWithUser = AuthenticatedRequest;

const log = createLogger('rateLimit');
const router: Router = express.Router();

// Helper function to convert AuthenticatedRequest to RequestWithUser
function toRequestWithUser(req: ReqWithUser): RequestWithUser {
  const result: RequestWithUser = {
    headers: req.headers,
  };

  if (req.user != null) {
    result.user = { id: req.user.id };
  }
  if (req.sessionID != null) {
    result.sessionID = req.sessionID;
  }
  if (req.ip != null) {
    result.ip = req.ip;
  }

  return result;
}

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

router.get('/:resourceType', async (req: ReqWithUser, res: Response) => {
  try {
    const resourceType = getParam(req.params, 'resourceType');

    if (!resourceType || typeof resourceType !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid resource type',
      });
    }

    const requestWithUser = toRequestWithUser(req);
    const userType = rateLimiter.getUserType(requestWithUser);
    const identifier = rateLimiter.getIdentifier(requestWithUser, userType);

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

const bulkSchema = z.object({
  resourceTypes: z.array(z.string()).min(1).max(10),
});

router.post(
  '/bulk',
  validateBody(bulkSchema),
  async (req: TypedRequest<z.infer<typeof bulkSchema>>, res: Response) => {
    try {
      const { resourceTypes } = req.body;

      const requestWithUser = toRequestWithUser(req as ReqWithUser);
      const userType = rateLimiter.getUserType(requestWithUser);
      const identifier = rateLimiter.getIdentifier(requestWithUser, userType);

      const results: Record<string, RateLimitStatus & { timeUntilReset: string | null }> = {};

      for (const resourceType of resourceTypes) {
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
  }
);

router.post('/reset/:resourceType', async (req: ReqWithUser, res: Response) => {
  try {
    const resourceType = getParam(req.params, 'resourceType');

    const requestWithUser = toRequestWithUser(req);
    const userType = rateLimiter.getUserType(requestWithUser);
    const identifier = rateLimiter.getIdentifier(requestWithUser, userType);

    if (env.NODE_ENV === 'production' && userType === 'anonymous') {
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

if (env.NODE_ENV === 'development') {
  router.get('/config/:resourceType', (req: ReqWithUser, res: Response) => {
    const resourceType = getParam(req.params, 'resourceType');
    const requestWithUser = toRequestWithUser(req);
    const userType = rateLimiter.getUserType(requestWithUser);
    const config = rateLimiter.getLimitConfig(resourceType, userType);

    res.json({
      success: true,
      data: {
        resourceType,
        userType,
        config: config || 'No configuration found',
        allConfigs: rateLimiter.getConfig().resources[resourceType],
      },
    });
  });
}

export default router;
