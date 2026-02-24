import { type Request, type Response } from 'express';

import {
  processAntragAgentStreaming,
  processAntragAgentRequest,
} from '../../agents/langgraph/AntragAgentGraph/agentModeProcessor.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('antraege:agent');
const router = createAuthenticatedRouter();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    log.debug('[antraege/agent] Agent mode request received');
    if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
      return processAntragAgentStreaming(req, res);
    }
    await processAntragAgentRequest(req, res);
  } catch (error) {
    log.error('[antraege/agent] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
    });
  }
});

export default router;
