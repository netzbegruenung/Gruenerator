import { Router, type Request, type Response } from 'express';

import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

import type { EditSessionData, EditSessionResponse } from './types.js';

const log = createLogger('editSession');
const router: Router = Router();

interface StoreSessionBody {
  imageData: string;
  originalImageData?: string;
  metadata?: Record<string, unknown>;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageData, originalImageData, metadata = {} } = req.body as StoreSessionBody;

    if (!imageData) {
      res.status(400).json({
        error: 'Image data is required',
      });
      return;
    }

    const sessionId = `sharepic-edit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const sessionData: EditSessionData = {
      imageData,
      originalImageData,
      metadata,
      createdAt: new Date().toISOString(),
    };

    await redisClient.setEx(sessionId, 3600, JSON.stringify(sessionData));

    log.debug(
      `[EditSession] Stored image data for session: ${sessionId}, hasOriginal: ${!!originalImageData}`
    );

    res.json({
      sessionId,
      expiresIn: 3600,
    } as EditSessionResponse);
  } catch (error) {
    log.error('[EditSession] Error storing session data:', error);
    res.status(500).json({
      error: 'Failed to store edit session data',
    });
  }
});

router.get(
  '/:sessionId',
  async (req: Request<{ sessionId: string }>, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          error: 'Session ID is required',
        });
        return;
      }

      const sessionDataString = await redisClient.get(sessionId);

      if (!sessionDataString || typeof sessionDataString !== 'string') {
        res.status(404).json({
          error: 'Edit session not found or expired',
        });
        return;
      }

      const sessionData = JSON.parse(sessionDataString) as EditSessionData;

      log.debug(
        `[EditSession] Retrieved image data for session: ${sessionId}, hasOriginal: ${!!sessionData.originalImageData}`
      );

      res.json({
        imageData: sessionData.imageData,
        originalImageData: sessionData.originalImageData,
        metadata: sessionData.metadata,
        createdAt: sessionData.createdAt,
      } as EditSessionResponse);
    } catch (error) {
      log.error('[EditSession] Error retrieving session data:', error);
      res.status(500).json({
        error: 'Failed to retrieve edit session data',
      });
    }
  }
);

router.delete(
  '/:sessionId',
  async (req: Request<{ sessionId: string }>, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          error: 'Session ID is required',
        });
        return;
      }

      const deleted = await redisClient.del(sessionId);

      log.debug(`[EditSession] Deleted session: ${sessionId}, success: ${deleted > 0}`);

      res.json({
        deleted: deleted > 0,
        sessionId,
      } as EditSessionResponse);
    } catch (error) {
      log.error('[EditSession] Error deleting session data:', error);
      res.status(500).json({
        error: 'Failed to delete edit session data',
      });
    }
  }
);

export default router;
