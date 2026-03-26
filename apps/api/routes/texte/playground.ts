/**
 * Playground endpoint for comparing text generation across models.
 * Accepts explicit provider/model overrides and streams the response.
 */

import express, { type Router, type Request, type Response } from 'express';

import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
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

router.get('/models', async (_req: Request, res: Response): Promise<void> => {
  const models = [
    {
      id: 'mistral-large-2512',
      provider: 'mistral',
      name: 'Mistral Large',
      category: 'Mistral',
      reasoning: false,
    },
    {
      id: 'magistral-medium-latest',
      provider: 'mistral',
      name: 'Magistral Medium',
      category: 'Mistral',
      reasoning: true,
    },
    {
      id: 'mistral-small-latest',
      provider: 'mistral',
      name: 'Mistral Small',
      category: 'Mistral',
      reasoning: false,
    },
    {
      id: 'qwen3.5-122b',
      provider: 'regolo',
      name: 'Qwen 3.5 122B',
      category: 'Regolo',
      reasoning: true,
    },
    {
      id: 'mistral-small-4-119b',
      provider: 'regolo',
      name: 'Mistral Small 4 119B',
      category: 'Regolo',
      reasoning: true,
    },
    {
      id: 'Llama-3.3-70B-Instruct',
      provider: 'regolo',
      name: 'Llama 3.3 70B',
      category: 'Regolo',
      reasoning: false,
    },
    {
      id: 'gpt-oss-120b',
      provider: 'regolo',
      name: 'GPT-OSS 120B',
      category: 'Regolo',
      reasoning: true,
    },
    {
      id: 'mistral-small3.2',
      provider: 'regolo',
      name: 'Mistral Small 3.2',
      category: 'Regolo',
      reasoning: false,
    },
    {
      id: 'gpt-oss:120b',
      provider: 'litellm',
      name: 'GPT-OSS 120B',
      category: 'LiteLLM',
      reasoning: true,
    },
    {
      id: 'openai/gpt-oss-120b',
      provider: 'ionos',
      name: 'GPT-OSS 120B',
      category: 'IONOS',
      reasoning: true,
    },
  ];

  res.json({ models });
});

export default router;
