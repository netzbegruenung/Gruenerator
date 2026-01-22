import express, { Response, Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import {
  saveRecentValue,
  getRecentValues,
  clearRecentValues,
  getFieldTypesWithCounts
} from '../../services/chat/RecentValuesService.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('recentValues');
const router: Router = express.Router();

interface RecentValueBody {
  fieldType: string;
  fieldValue: string;
  formName?: string;
}

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fieldType, fieldValue, formName } = req.body as RecentValueBody;
    const userId = req.user!.id;

    if (!fieldType || !fieldValue) {
      return res.status(400).json({
        error: 'fieldType and fieldValue are required'
      });
    }

    const result = await saveRecentValue(userId, fieldType, fieldValue, formName);

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Recent value saved successfully'
    });
  } catch (error) {
    log.error('[RecentValues API] Error saving recent value:', error);
    return res.status(500).json({
      error: (error as Error).message || 'Failed to save recent value'
    });
  }
});

router.get('/:fieldType', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fieldType } = req.params;
    const { limit } = req.query;
    const userId = req.user!.id;

    if (!fieldType) {
      return res.status(400).json({
        error: 'fieldType parameter is required'
      });
    }

    const values = await getRecentValues(userId, fieldType, limit ? parseInt(limit as string, 10) : undefined);

    return res.json({
      success: true,
      data: values,
      fieldType,
      count: values.length
    });
  } catch (error) {
    log.error('[RecentValues API] Error retrieving recent values:', error);
    return res.status(500).json({
      error: (error as Error).message || 'Failed to retrieve recent values'
    });
  }
});

router.delete('/:fieldType', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fieldType } = req.params;
    const userId = req.user!.id;

    if (!fieldType) {
      return res.status(400).json({
        error: 'fieldType parameter is required'
      });
    }

    const deletedCount = await clearRecentValues(userId, fieldType);

    return res.json({
      success: true,
      message: `Cleared ${deletedCount} recent values for ${fieldType}`,
      deletedCount
    });
  } catch (error) {
    log.error('[RecentValues API] Error clearing recent values:', error);
    return res.status(500).json({
      error: (error as Error).message || 'Failed to clear recent values'
    });
  }
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const fieldTypes = await getFieldTypesWithCounts(userId);

    res.json({
      success: true,
      data: fieldTypes,
      count: fieldTypes.length
    });
  } catch (error) {
    log.error('[RecentValues API] Error retrieving field types:', error);
    res.status(500).json({
      error: (error as Error).message || 'Failed to retrieve field types'
    });
  }
});

export default router;
