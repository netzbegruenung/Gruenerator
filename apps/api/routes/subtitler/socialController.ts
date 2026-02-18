/**
 * Subtitler Social Controller
 * Handles social media text generation from subtitles.
 */

import express, { type Response, type Router } from 'express';

import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('subtitler-social');
const router: Router = express.Router();

interface SocialRequest extends AuthenticatedRequest {
  app: AuthenticatedRequest['app'] & { locals: { aiWorkerPool?: any } };
}

router.post('/generate-social', async (req: SocialRequest, res: Response): Promise<void> => {
  const { subtitles } = req.body;

  if (!subtitles) {
    res.status(400).json({ error: 'Untertitel werden benötigt' });
    return;
  }

  try {
    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      res.status(500).json({ error: 'AI-Service nicht verfügbar' });
      return;
    }

    const result = await aiWorkerPool.processRequest({
      type: 'subtitler_social',
      systemPrompt:
        'Du bist Social Media Manager für Bündnis 90/Die Grünen. Erstelle einen Instagram Reel Beitragstext basierend auf den Untertiteln des Videos. Der Text soll die Kernbotschaft des Videos aufgreifen und in einen ansprechenden Social Media Post umwandeln.',
      messages: [
        {
          role: 'user',
          content: `Untertitel: ${subtitles}

Erstelle einen Instagram Reel Beitragstext, der:
1. Mit einem starken Hook beginnt
2. Die Kernbotschaft des Videos prägnant zusammenfasst
3. Maximal 2-3 relevante Hashtags verwendet
4. Mit einem Call-to-Action endet
5. Emojis passend aber sparsam einsetzt
6. Maximal 300 Zeichen lang ist
7. Den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt`,
        },
      ],
      options: { max_tokens: 1000, temperature: 0.7 },
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    res.json({ content: result.content, metadata: result.metadata });
  } catch (error: any) {
    log.error('Social media text generation failed:', error);
    res
      .status(500)
      .json({ error: 'Fehler bei der Erstellung des Social Media Texts', details: error.message });
  }
});

export default router;
