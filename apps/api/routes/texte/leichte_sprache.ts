/**
 * Leichte Sprache Routes
 * Transforms text into easy-to-read German (Leichte Sprache)
 */

import { Response } from 'express';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('leichte_sprache');
const router = createAuthenticatedRouter();

/**
 * POST / - Transform text to Leichte Sprache
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  log.debug('[leichte_sprache] Request received via promptProcessor');
  await processGraphRequest('leichte_sprache', req, res);
});

export default router;
