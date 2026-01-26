/**
 * Etherpad Routes
 *
 * Provides API endpoints for creating collaborative Etherpad documents.
 */

import express, { Request, Response, Router } from 'express';
import { createPadWithText } from '../../services/etherpad/index.js';
import { generateSecureId } from '../../utils/validation/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('etherpad');

const router: Router = express.Router();

// ============================================================================
// Types
// ============================================================================

interface CreatePadRequest {
  text: string;
  documentType?: string;
}

interface CreatePadResponse {
  padURL: string;
}

interface ErrorResponse {
  error: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Create a new Etherpad with text content
 * POST /api/etherpad/create
 */
router.post('/create', async (req: Request, res: Response<CreatePadResponse | ErrorResponse>) => {
  try {
    const { text, documentType } = req.body as CreatePadRequest;

    if (!text) {
      return res.status(400).json({ error: 'Text ist erforderlich' });
    }

    const padId = generateSecureId();
    const result = await createPadWithText({
      padId,
      text,
      documentType,
    });

    return res.json({ padURL: result.padUrl });
  } catch (error) {
    log.error('Fehler beim Erstellen des Etherpads:', error);
    return res.status(500).json({ error: 'Interner Serverfehler beim Erstellen des Etherpads' });
  }
});

export default router;
