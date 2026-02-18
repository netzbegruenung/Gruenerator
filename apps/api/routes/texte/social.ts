import { type Router, type Request, type Response } from 'express';

import {
  processStrategyGeneration,
  processProductionGeneration,
} from '../../agents/langgraph/PRAgent/index.js';
import { processGraphRequest } from '../../agents/langgraph/PromptProcessor.js';
import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { prAgentWorkflow } from '../../services/WorkflowService/index.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import type { User } from '../../types/auth.js';

const log = createLogger('claude_social');
const router: Router = createAuthenticatedRouter();

const routeHandler = async (req: Request, res: Response): Promise<void> => {
  log.debug('[claude_social] Request received via promptProcessor');
  if (req.query.stream === 'true' || req.headers.accept === 'text/event-stream') {
    return processGraphRequestStreaming('social', req, res);
  }
  await processGraphRequest('social', req, res);
};

router.post('/', routeHandler);

/**
 * POST /api/social/strategy
 * Phase 1: Generate strategic framing + arguments
 */
router.post('/strategy', async (req: Request, res: Response): Promise<void> => {
  try {
    log.debug('[claude_social/strategy] Strategy generation requested');
    await processStrategyGeneration(req.body, req, res);
  } catch (error) {
    log.error('[claude_social/strategy] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
    });
  }
});

/**
 * POST /api/social/production
 * Phase 2: Generate production content from approved strategy
 */
router.post('/production', async (req: Request, res: Response): Promise<void> => {
  const { workflow_id, approved_platforms, user_feedback } = req.body;

  if (!workflow_id || !approved_platforms) {
    res.status(400).json({
      success: false,
      error: 'workflow_id und approved_platforms erforderlich',
    });
    return;
  }

  try {
    log.debug(
      '[claude_social/production] Production generation requested for workflow:',
      workflow_id
    );

    // Update workflow with approval
    await prAgentWorkflow.approve(workflow_id, approved_platforms, user_feedback);

    // Generate production
    await processProductionGeneration(workflow_id, approved_platforms, user_feedback, req, res);
  } catch (error) {
    log.error('[claude_social/production] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
    });
  }
});

/**
 * GET /api/social/workflow/:id
 * Fetch workflow state
 */
router.get('/workflow/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const workflow = await prAgentWorkflow.getWorkflow(
      req.params.id,
      (req.user as User | undefined)?.id
    );

    if (!workflow) {
      res.status(404).json({
        success: false,
        error: 'Workflow nicht gefunden',
      });
      return;
    }

    res.json({
      success: true,
      workflow,
    });
  } catch (error) {
    log.error('[claude_social/workflow] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
    });
  }
});

export default router;
