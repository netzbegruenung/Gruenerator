/**
 * Playground endpoint for comparing text generation across models.
 * Accepts explicit provider/model overrides and streams the response.
 */

import express, { type Router, type Request, type Response } from 'express';

import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { getAvailableModels } from '../../services/ai/modelDiscovery.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('playground');

const router: Router = express.Router();

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const { type, provider, model, ...rest } = req.body;

  if (!type) {
    res.status(400).json({ error: 'type is required' });
    return;
  }

  log.debug(`[playground] Generate: type=${type}, provider=${provider}, model=${model}`);

  req.body = { ...rest, provider, model };

  return processGraphRequestStreaming(type, req, res);
});

router.get('/prompts', async (_req: Request, res: Response): Promise<void> => {
  const fs = await import('fs/promises');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const promptsDir = path.join(__dirname, '../../prompts');

  try {
    const files = await fs.readdir(promptsDir);
    const prompts = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(promptsDir, file), 'utf-8');
        const config = JSON.parse(content);
        if (config.id && config.name && config.requestFields) {
          prompts.push({
            id: config.id,
            name: config.name,
            requestFields: config.requestFields,
            platforms: config.platforms ? Object.keys(config.platforms) : [],
            features: config.features || {},
            options: config.options || {},
          });
        }
      } catch {
        // skip invalid files
      }
    }

    res.json({ prompts });
  } catch (error) {
    log.error('[playground] Failed to list prompts:', error);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

router.get('/models', async (req: Request, res: Response): Promise<void> => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const models = await getAvailableModels(forceRefresh);
    res.json({ models });
  } catch (error) {
    log.error('[playground] Failed to fetch models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

export default router;
