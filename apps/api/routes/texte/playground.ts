/**
 * Playground endpoint for comparing text generation across models.
 * Accepts explicit provider/model overrides and streams the response.
 */

import express, { type Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { processGraphRequestStreaming } from '../../agents/langgraph/streamingProcessor.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
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

const playgroundGenerateSchema = z
  .object({
    type: z.string().min(1, 'type is required'),
    provider: z.string().optional(),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    userMessage: z.string().optional(),
  })
  .passthrough();
type PlaygroundGenerateBody = z.infer<typeof playgroundGenerateSchema>;

router.post(
  '/generate',
  validateBody(playgroundGenerateSchema),
  async (req: TypedRequest<PlaygroundGenerateBody>, res: Response): Promise<void> => {
    const { type, provider, model, systemPrompt, userMessage, ...rest } = req.body;

    const resolvedType = type === 'free' ? 'custom_prompt' : type;

    log.debug(`[playground] Generate: type=${resolvedType}, provider=${provider}, model=${model}`);

    // Reassign body for downstream processGraphRequestStreaming
    const baseReq = req as Request;
    if (type === 'free') {
      baseReq.body = {
        provider,
        model,
        prompt: systemPrompt || '',
        userInput: userMessage || '',
      };
    } else {
      baseReq.body = { ...rest, provider, model };
    }

    return processGraphRequestStreaming(resolvedType, baseReq, res);
  }
);

router.get('/prompts', (_req: Request, res: Response): void => {
  res.json({ prompts: PLAYGROUND_PROMPTS });
});

router.get('/models', async (req: Request, res: Response): Promise<void> => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const models = await getAvailableModels(forceRefresh);
    res.json({ models });
  } catch (error) {
    log.error('[playground] Failed to fetch models:', { error });
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

export default router;
