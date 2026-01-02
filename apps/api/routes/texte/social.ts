import { Router, Request, Response } from 'express';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_social');
const router: Router = createAuthenticatedRouter();

const routeHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_social] Request received via promptProcessor');
  await processGraphRequest('social', req, res);
};

router.post('/', routeHandler);

export default router;
