import express from 'express';
const router = express.Router();
import { requireAuth } from '../middleware/authMiddleware.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('recentValues');

import { saveRecentValue,
  getRecentValues,
  clearRecentValues,
  getFieldTypesWithCounts } from '../services/RecentValuesService.js';

/**
 * POST /api/recent-values
 * Save a recent value for a form field
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { fieldType, fieldValue, formName } = req.body;
    const userId = req.user.id;

    if (!fieldType || !fieldValue) {
      return res.status(400).json({
        error: 'fieldType and fieldValue are required'
      });
    }

    const result = await saveRecentValue(userId, fieldType, fieldValue, formName);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Recent value saved successfully'
    });
  } catch (error) {
    log.error('[RecentValues API] Error saving recent value:', error);
    res.status(500).json({
      error: error.message || 'Failed to save recent value'
    });
  }
});

/**
 * GET /api/recent-values/:fieldType
 * Get recent values for a specific field type
 */
router.get('/:fieldType', requireAuth, async (req, res) => {
  try {
    const { fieldType } = req.params;
    const { limit } = req.query;
    const userId = req.user.id;

    if (!fieldType) {
      return res.status(400).json({
        error: 'fieldType parameter is required'
      });
    }

    const values = await getRecentValues(userId, fieldType, limit);

    res.json({
      success: true,
      data: values,
      fieldType,
      count: values.length
    });
  } catch (error) {
    log.error('[RecentValues API] Error retrieving recent values:', error);
    res.status(500).json({
      error: error.message || 'Failed to retrieve recent values'
    });
  }
});

/**
 * DELETE /api/recent-values/:fieldType
 * Clear all recent values for a specific field type
 */
router.delete('/:fieldType', requireAuth, async (req, res) => {
  try {
    const { fieldType } = req.params;
    const userId = req.user.id;

    if (!fieldType) {
      return res.status(400).json({
        error: 'fieldType parameter is required'
      });
    }

    const deletedCount = await clearRecentValues(userId, fieldType);

    res.json({
      success: true,
      message: `Cleared ${deletedCount} recent values for ${fieldType}`,
      deletedCount
    });
  } catch (error) {
    log.error('[RecentValues API] Error clearing recent values:', error);
    res.status(500).json({
      error: error.message || 'Failed to clear recent values'
    });
  }
});

/**
 * GET /api/recent-values
 * Get all field types with recent values and their counts
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const fieldTypes = await getFieldTypesWithCounts(userId);

    res.json({
      success: true,
      data: fieldTypes,
      count: fieldTypes.length
    });
  } catch (error) {
    log.error('[RecentValues API] Error retrieving field types:', error);
    res.status(500).json({
      error: error.message || 'Failed to retrieve field types'
    });
  }
});

export default router;