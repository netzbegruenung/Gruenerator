/**
 * Mode Controller - User document mode management (manual vs wolke)
 *
 * Handles:
 * - GET / - Get user's document mode preference
 * - POST / - Set user's document mode preference
 *
 * This controller eliminates duplicate route definitions from original documents.mjs
 * (lines 61-95 and 253-298 were identical)
 */

import express, { type Router, type Response } from 'express';

import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { createLogger } from '../../utils/logger.js';

import type { DocumentRequest, SetModeRequestBody } from './types.js';

const log = createLogger('documents:mode');
const router: Router = express.Router();

// Initialize service
const postgresDocumentService = getPostgresDocumentService();

/**
 * GET / - Get user's document mode
 */
router.get('/', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const mode = await postgresDocumentService.getUserDocumentMode(userId);

    res.json({
      success: true,
      mode,
    });
  } catch (error) {
    log.error('[GET /] Error getting document mode:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get document mode',
    });
  }
});

/**
 * POST / - Set user's document mode
 */
router.post('/', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { mode } = req.body as SetModeRequestBody;

    // Validate mode parameter
    if (!mode || !['manual', 'wolke'].includes(mode)) {
      res.status(400).json({
        success: false,
        message: 'Invalid mode. Must be "manual" or "wolke"',
      });
      return;
    }

    const result = await postgresDocumentService.setUserDocumentMode(userId, mode);

    res.json({
      success: true,
      mode: result.mode,
    });
  } catch (error) {
    log.error('[POST /] Error setting document mode:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to set document mode',
    });
  }
});

export default router;
