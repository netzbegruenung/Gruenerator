import { Router, type Response } from 'express';

import { type AuthenticatedRequest } from '../../middleware/types.js';
import {
  createAgent,
  getAgentsByUser,
  getAgentById,
  updateAgent,
  deleteAgent,
  toggleAgent,
  getExecutionHistory,
} from '../../services/briefing/BriefingAgentService.js';
import { parsePrompt } from '../../services/briefing/BriefingConfigParser.js';
import { execute } from '../../services/briefing/BriefingExecutionService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getParam } from '../../utils/params.js';

import type { BriefingConfig } from '../../services/briefing/types.js';

const log = createLogger('briefing-routes');
const router: Router = Router();

function validateConfig(config: unknown): config is BriefingConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  return Array.isArray(c.sources) && c.sources.length > 0;
}

router.post('/agents', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      description,
      config,
      prompt,
      schedule_type,
      schedule_hour,
      schedule_timezone,
      delivery_email,
    } = req.body;

    let finalConfig = config;
    if (!finalConfig && prompt) {
      finalConfig = await parsePrompt(prompt);
    }

    if (!name || !finalConfig) {
      res.status(400).json({ error: 'name and config (or prompt) are required' });
      return;
    }

    if (!validateConfig(finalConfig)) {
      res.status(400).json({ error: 'config must have at least one source' });
      return;
    }

    const agent = await createAgent(req.user!.id, {
      name,
      description: description || prompt,
      config: finalConfig,
      schedule_type,
      schedule_hour,
      schedule_timezone,
      delivery_email: delivery_email || req.user!.email,
    });

    res.status(201).json({ success: true, agent });
  } catch (error) {
    const err = toError(error);
    log.error(`Create agent failed: ${err.message}`);
    res.status(err.message.includes('Maximum') ? 400 : 500).json({ error: err.message });
  }
});

router.get('/agents', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const agents = await getAgentsByUser(req.user!.id);
    res.json({ success: true, agents });
  } catch (error) {
    res.status(500).json({ error: toError(error).message });
  }
});

router.get(
  '/agents/:id',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const id = getParam(req.params, 'id');
      const agent = await getAgentById(id, req.user!.id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json({ success: true, agent });
    } catch (error) {
      res.status(500).json({ error: toError(error).message });
    }
  }
);

router.put(
  '/agents/:id',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const id = getParam(req.params, 'id');
      const {
        name,
        description,
        config,
        schedule_type,
        schedule_hour,
        schedule_timezone,
        delivery_email,
      } = req.body;

      if (config !== undefined && !validateConfig(config)) {
        res.status(400).json({ error: 'config must have at least one source' });
        return;
      }

      const agent = await updateAgent(id, req.user!.id, {
        name,
        description,
        config,
        schedule_type,
        schedule_hour,
        schedule_timezone,
        delivery_email,
      });
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json({ success: true, agent });
    } catch (error) {
      res.status(500).json({ error: toError(error).message });
    }
  }
);

router.delete(
  '/agents/:id',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const id = getParam(req.params, 'id');
      const deleted = await deleteAgent(id, req.user!.id);
      if (!deleted) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: toError(error).message });
    }
  }
);

router.post(
  '/agents/:id/toggle',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const id = getParam(req.params, 'id');
      const agent = await toggleAgent(id, req.user!.id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json({ success: true, agent });
    } catch (error) {
      res.status(500).json({ error: toError(error).message });
    }
  }
);

router.post(
  '/agents/:id/run',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const id = getParam(req.params, 'id');
      const agent = await getAgentById(id, req.user!.id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      res.status(202).json({ success: true, message: 'Execution started', agentId: id });

      execute(id).catch((err) => {
        log.error(`Manual execution failed for agent ${id}: ${toError(err).message}`);
      });
    } catch (error) {
      res.status(500).json({ error: toError(error).message });
    }
  }
);

router.get(
  '/agents/:id/history',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    try {
      const id = getParam(req.params, 'id');
      const agent = await getAgentById(id, req.user!.id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      const limit = Math.min(parseInt(String(req.query.limit)) || 20, 100);
      const offset = parseInt(String(req.query.offset)) || 0;
      const history = await getExecutionHistory(id, limit, offset);
      res.json({ success: true, history });
    } catch (error) {
      res.status(500).json({ error: toError(error).message });
    }
  }
);

router.post('/parse', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    const config = await parsePrompt(prompt);
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ error: toError(error).message });
  }
});

export default router;
