const express = require('express');
const router = express.Router();
// Import session-based auth middleware from authMiddleware
const authMiddlewareModule = require('../../middleware/authMiddleware');
const { createLogger } = require('../../utils/logger.js');
const log = createLogger('antraege');

const { requireAuth } = authMiddlewareModule;
const {
  saveAntragToSupabase,
  deleteAntragById
  // Import other needed service functions here, e.g., getAntragById, getAllAntraege
} = require('../../services/antragService');
const simpleAntragRouter = require('./antrag_simple'); // Import the simple generator router
const experimentalAntragRouter = require('./experimentalRoutes.mjs').default; // Import the experimental interactive generator router (ES6 default export)

/**
 * Claude-API-Router
 * Bündelt die Endpoints für Suchanfragen und Anträge
 */

// === Middleware for all /api/antraege routes ===
router.use((req, res, next) => {
  log.debug(`Antraege API Request: ${req.method} ${req.originalUrl}`);
  next();
});

// === Route for simple Antrag generation ===
// Mounts the logic from antrag_simple.js under /generate-simple
router.use('/generate-simple', simpleAntragRouter);

// === Route for experimental interactive Antrag generation ===
// Mounts the experimental interactive logic under /experimental
router.use('/experimental', experimentalAntragRouter);


// === Specific Antrag CRUD Routes ===


// GET /api/antraege - Placeholder for fetching all Anträge (requires logic and potentially admin rights)
router.get('/', async (req, res) => {
  log.debug('[GET /api/antraege] Request received to fetch all Anträge (not implemented).');
  // TODO: Implement logic to fetch all Anträge (consider pagination, filtering, authorization)
  res.status(501).json({ message: 'Fetching all Anträge not implemented yet.' });
});

// GET /api/antraege/:antragId - Placeholder for fetching a single Antrag by ID
router.get('/:antragId', async (req, res) => {
  const { antragId } = req.params;
  log.debug(`[GET /api/antraege/:antragId] Request received for Antrag ID ${antragId} (not implemented).`);
  // TODO: Implement logic to fetch a single Antrag by ID (consider authorization)
  res.status(501).json({ message: `Fetching Antrag ${antragId} not implemented yet.` });
});

// DELETE /api/antraege/:antragId - Delete a specific Antrag owned by the user
router.delete('/:antragId', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const { antragId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated.' });
  }
  if (!antragId) {
    return res.status(400).json({ error: 'Antrag ID missing in request path.' });
  }

  log.debug(`[DELETE /api/antraege/:antragId] Request received for Antrag ID ${antragId} from user ${userId}`);

  try {
    await deleteAntragById(antragId, userId);
    log.debug(`[DELETE /api/antraege/:antragId] Successfully processed delete request for Antrag ID ${antragId} by user ${userId}`);
    res.status(204).send();

  } catch (error) {
    log.error(`[DELETE /api/antraege/:antragId] Error deleting Antrag ID ${antragId} for user ${userId}:`, error.message);
    if (error.message.includes('not found')) { // Check if service layer indicates not found/forbidden
        res.status(404).json({ error: 'Antrag not found or you do not have permission to delete it.' });
    } else if (error.message.includes('Database error') || error.message.includes('not initialized')) {
        res.status(500).json({ error: 'Internal server error while deleting the Antrag.' });
    } else {
        res.status(500).json({ error: 'An unexpected error occurred while deleting the Antrag.' });
    }
  }
});

module.exports = router; 