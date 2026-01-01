import express from 'express';
import redisClient from '../../utils/redisClient.js';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('editSession');

const router = express.Router();

/**
 * Store sharepic image data in Redis for edit sessions
 * POST /api/sharepic/edit-session
 */
router.post('/', async (req, res) => {
  try {
    const { imageData, originalImageData, metadata = {} } = req.body;

    if (!imageData) {
      return res.status(400).json({
        error: 'Image data is required'
      });
    }

    // Generate unique session ID
    const sessionId = `sharepic-edit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store both image data in Redis with 1-hour expiration
    const sessionData = {
      imageData,
      originalImageData, // Store original background image
      metadata,
      createdAt: new Date().toISOString()
    };

    // Set TTL to 1 hour (3600 seconds)
    await redisClient.setEx(sessionId, 3600, JSON.stringify(sessionData));

    log.debug(`[EditSession] Stored image data for session: ${sessionId}, hasOriginal: ${!!originalImageData}`);

    res.json({
      sessionId,
      expiresIn: 3600 // seconds
    });

  } catch (error) {
    log.error('[EditSession] Error storing session data:', error);
    res.status(500).json({
      error: 'Failed to store edit session data'
    });
  }
});

/**
 * Retrieve sharepic image data from Redis
 * GET /api/sharepic/edit-session/:sessionId
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ 
        error: 'Session ID is required' 
      });
    }

    // Retrieve data from Redis
    const sessionDataString = await redisClient.get(sessionId);
    
    if (!sessionDataString) {
      return res.status(404).json({ 
        error: 'Edit session not found or expired' 
      });
    }
    
    const sessionData = JSON.parse(sessionDataString);
    
    log.debug(`[EditSession] Retrieved image data for session: ${sessionId}, hasOriginal: ${!!sessionData.originalImageData}`);

    res.json({
      imageData: sessionData.imageData,
      originalImageData: sessionData.originalImageData, // Return original background
      metadata: sessionData.metadata,
      createdAt: sessionData.createdAt
    });
    
  } catch (error) {
    log.error('[EditSession] Error retrieving session data:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve edit session data' 
    });
  }
});

/**
 * Delete sharepic edit session (optional cleanup)
 * DELETE /api/sharepic/edit-session/:sessionId
 */
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ 
        error: 'Session ID is required' 
      });
    }

    const deleted = await redisClient.del(sessionId);
    
    log.debug(`[EditSession] Deleted session: ${sessionId}, success: ${deleted > 0}`);
    
    res.json({ 
      deleted: deleted > 0,
      sessionId 
    });
    
  } catch (error) {
    log.error('[EditSession] Error deleting session data:', error);
    res.status(500).json({ 
      error: 'Failed to delete edit session data' 
    });
  }
});

export default router;