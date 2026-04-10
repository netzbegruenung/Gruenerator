/**
 * Subtitler Social Controller
 * Handles social media text generation from subtitles.
 */

import express, { type Response, type Router } from 'express';

import {
  extractLocaleFromRequest,
  localizePlaceholders,
} from '../../services/localization/index.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('subtitler-social');
const router: Router = express.Router();

router.post('/generate-social', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { subtitles } = req.body;

  if (!subtitles) {
    res.status(400).json({ error: 'Untertitel werden benötigt' });
    return;
  }

  try {
    const aiWorkerPool = getAIWorkerPool(req);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locale = extractLocaleFromRequest(req as any);
    const systemPrompt = localizePlaceholders(
      'Du bist Social Media Manager für {{partyName}}. Erstelle einen Instagram Reel Beitragstext basierend auf den Untertiteln des Videos. Der Text soll die Kernbotschaft des Videos aufgreifen und in einen ansprechenden Social Media Post umwandeln.',
      locale
    );
    const userPrompt = localizePlaceholders(
      `Untertitel: ${subtitles}

Erstelle einen Instagram Reel Beitragstext, der:
1. Mit einem starken Hook beginnt
2. Die Kernbotschaft des Videos prägnant zusammenfasst
3. Maximal 2-3 relevante Hashtags verwendet
4. Mit einem Call-to-Action endet
5. Emojis passend aber sparsam einsetzt
6. Maximal 300 Zeichen lang ist
7. Den Stil und die Werte von {{partyName}} widerspiegelt`,
      locale
    );

    const result = await aiWorkerPool.processRequest({
      type: 'subtitler_social',
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      options: { max_tokens: 1000, temperature: 0.7 },
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    res.json({ content: result.content, metadata: result.metadata });
  } catch (error: unknown) {
    log.error('Social media text generation failed:', error);
    res.status(500).json({
      error: 'Fehler bei der Erstellung des Social Media Texts',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
