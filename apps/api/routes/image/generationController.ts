/**
 * Image Generation Controller
 * Handles daily image generation limits and status
 */

import express, { Response, Router } from 'express';
import { ImageGenerationCounter } from '../../services/counters/index.js';
import { redisClient } from '../../utils/redis/index.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import type {
  AuthenticatedRequest,
  GenerationStatusResponse,
  GenerationIncrementResponse,
  GenerationResetResponse,
} from './types.js';

const log = createLogger('imageGeneration');
const router: Router = express.Router();
const imageCounter = new ImageGenerationCounter(redisClient as any);

router.use(requireAuth);

/**
 * GET /status
 * Get current image generation status for authenticated user
 */
router.get(
  '/status',
  async (req: AuthenticatedRequest, res: Response<GenerationStatusResponse>) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID not found in request',
        });
      }

      const status = await imageCounter.checkLimit(userId);
      const timeUntilReset = imageCounter.getTimeUntilReset();

      return res.json({
        success: true,
        data: {
          ...status,
          timeUntilReset,
          userId,
        },
      });
    } catch (error) {
      log.error('[ImageGeneration API] Error getting status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get image generation status',
      });
    }
  }
);

/**
 * POST /increment
 * Increment counter after successful generation (internal use)
 */
router.post(
  '/increment',
  async (req: AuthenticatedRequest, res: Response<GenerationIncrementResponse>) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User ID not found in request',
        });
      }

      const result = await imageCounter.incrementCount(userId);

      if (!result.success) {
        return res.status(429).json({
          success: false,
          error: 'Daily image generation limit reached',
          data: result,
        });
      }

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      log.error('[ImageGeneration API] Error incrementing counter:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to increment counter',
      });
    }
  }
);

/**
 * POST /reset
 * Reset counter for current user (Admin/Testing)
 */
router.post('/reset', async (req: AuthenticatedRequest, res: Response<GenerationResetResponse>) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found in request',
      });
    }

    const success = await imageCounter.resetUserCounter(userId);

    return res.json({
      success,
      message: success ? 'Counter reset successfully' : 'Failed to reset counter',
    });
  } catch (error) {
    log.error('[ImageGeneration API] Error resetting counter:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset counter',
    });
  }
});

export default router;
