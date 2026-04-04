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

const PLAYGROUND_PROMPTS = [
  {
    id: 'free',
    name: 'Freie Eingabe',
    description: 'Eigenen System-Prompt und Nachricht eingeben',
    fields: ['systemPrompt', 'userMessage'],
  },
  {
    id: 'universal',
    name: 'Text Generator',
    description: 'Texte in verschiedenen Formaten generieren',
    fields: ['textForm', 'inhalt'],
  },
  {
    id: 'leichte_sprache',
    name: 'Leichte Sprache',
    description: 'Texte in Leichte Sprache übersetzen',
    fields: ['originalText'],
  },
];

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const { type, provider, model, ...rest } = req.body;

  const resolvedType = type === 'free' ? 'custom_prompt' : type;

  if (!resolvedType) {
    res.status(400).json({ error: 'type is required' });
    return;
  }

  log.debug(`[playground] Generate: type=${resolvedType}, provider=${provider}, model=${model}`);

  if (type === 'free') {
    req.body = {
      provider,
      model,
      prompt: rest.systemPrompt || '',
      userInput: rest.userMessage || '',
    };
  } else {
    req.body = { ...rest, provider, model };
  }

  return processGraphRequestStreaming(resolvedType, req, res);
});

router.get('/prompts', (_req: Request, res: Response): void => {
  res.json({ prompts: PLAYGROUND_PROMPTS });
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
