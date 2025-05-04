const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const {
  saveAntragToSupabase,
  deleteAntragById
  // Import other needed service functions here, e.g., getAntragById, getAllAntraege
} = require('../../services/antragService');
const simpleAntragRouter = require('./antrag_simple'); // Import the simple generator router
const generateDescriptionRouter = require('./generate-description'); // Import the description generator router

/**
 * Claude-API-Router
 * Bündelt die Endpoints für Suchanfragen und Anträge
 */

// === Middleware for all /api/antraege routes ===
router.use((req, res, next) => {
  console.log(`Antraege API Request: ${req.method} ${req.originalUrl}`);
  next();
});

// === Route for simple Antrag generation ===
// Mounts the logic from antrag_simple.js under /generate-simple
router.use('/generate-simple', simpleAntragRouter);

// === Route for description generation ===
// Mounts the logic from generate-description.js under /generate-description
router.use('/generate-description', generateDescriptionRouter);

// === Specific Antrag CRUD Routes ===

// POST /api/antraege - Save a new Antrag (previously /api/antrag-save)
router.post('/', authMiddleware, async (req, res) => {
  // Log req.user IMMEDIATELY after middleware runs
  console.log(`[POST /api/antraege] Route handler started. req.user received:`, req.user ? { id: req.user.id, email: req.user.email, aud: req.user.aud } : 'undefined');

  const userId = req.user?.id; 
  console.log(`[POST /api/antraege] Extracted userId: ${userId}`);

  if (!userId) {
    // This log helps distinguish between req.user being absent vs req.user missing an id
    console.error(`[POST /api/antraege] Authentication failed or user ID missing in req.user. req.user was: ${JSON.stringify(req.user)}`); 
    return res.status(401).json({ error: 'User not properly authenticated or user ID missing.' });
  }

  try {
    const { title, description, antragstext, status, antragsteller, kontakt_email, kontakt_erlaubt, is_private } = req.body; // Include fields from popup
    if (!title || !antragstext) {
      return res.status(400).json({ error: 'Title and Antragstext are required.' });
    }
    // Pass all relevant fields from req.body + the confirmed user_id
    const antragData = { 
        title, 
        description, 
        antragstext, 
        status, 
        user_id: userId, // Use the ID confirmed by the middleware
        antragsteller, 
        kontakt_email, 
        kontakt_erlaubt,
        is_private 
    };

    console.log(`[POST /api/antraege] Calling antragService.saveAntragToSupabase for user ${userId} with data:`, { ...antragData, antragstext: antragstext.substring(0, 50) + '...' }); // Avoid logging full text
    const savedAntrag = await saveAntragToSupabase(antragData);
    console.log(`[POST /api/antraege] Antrag ${savedAntrag.id} saved successfully for user ${userId}.`);
    res.status(201).json(savedAntrag);

  } catch (error) {
    console.error(`[POST /api/antraege] Error saving Antrag for user ${userId}:`, error.message);
    if (error.message.includes('required')) {
      res.status(400).json({ error: error.message });
    } else if (error.message.includes('not initialized') || error.message.includes('table not found') || error.message.includes('Database error')) {
      res.status(500).json({ error: 'Internal server configuration error.' });
    } else {
      res.status(500).json({ error: 'An unexpected error occurred while saving the Antrag.' });
    }
  }
});

// GET /api/antraege - Placeholder for fetching all Anträge (requires logic and potentially admin rights)
router.get('/', async (req, res) => {
  console.log('[GET /api/antraege] Request received to fetch all Anträge (not implemented).');
  // TODO: Implement logic to fetch all Anträge (consider pagination, filtering, authorization)
  res.status(501).json({ message: 'Fetching all Anträge not implemented yet.' });
});

// GET /api/antraege/:antragId - Placeholder for fetching a single Antrag by ID
router.get('/:antragId', async (req, res) => {
  const { antragId } = req.params;
  console.log(`[GET /api/antraege/:antragId] Request received for Antrag ID ${antragId} (not implemented).`);
  // TODO: Implement logic to fetch a single Antrag by ID (consider authorization)
  res.status(501).json({ message: `Fetching Antrag ${antragId} not implemented yet.` });
});

// DELETE /api/antraege/:antragId - Delete a specific Antrag owned by the user
router.delete('/:antragId', authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  const { antragId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated.' });
  }
  if (!antragId) {
    return res.status(400).json({ error: 'Antrag ID missing in request path.' });
  }

  console.log(`[DELETE /api/antraege/:antragId] Request received for Antrag ID ${antragId} from user ${userId}`);

  try {
    await deleteAntragById(antragId, userId);
    console.log(`[DELETE /api/antraege/:antragId] Successfully processed delete request for Antrag ID ${antragId} by user ${userId}`);
    res.status(204).send();

  } catch (error) {
    console.error(`[DELETE /api/antraege/:antragId] Error deleting Antrag ID ${antragId} for user ${userId}:`, error.message);
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