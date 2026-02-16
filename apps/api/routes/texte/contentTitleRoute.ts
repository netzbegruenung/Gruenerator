import express, { type Router, type Request, type Response } from 'express';

import authMiddleware from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import mistralClient from '../../workers/mistralClient.js';

const log = createLogger('content-title');
const { requireAuth } = authMiddleware;

const contentTitleRouter: Router = express.Router();

const TITLE_PROMPT = `Du bist ein Experte für prägnante deutsche Titel.
Erstelle einen kurzen, aussagekräftigen Titel (3-8 Wörter) für den folgenden Inhalt.
Antworte NUR mit dem Titel, nichts anderes. Kein Punkt am Ende.`;

contentTitleRouter.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { content, contentType } = req.body;

  if (!content || typeof content !== 'string') {
    res.status(400).json({ success: false, error: 'content is required' });
    return;
  }

  const snippet = content.slice(0, 500);

  try {
    const response = await mistralClient.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: TITLE_PROMPT },
        {
          role: 'user',
          content: `Inhaltstyp: ${contentType || 'Text'}\n\nInhalt:\n${snippet}`,
        },
      ],
      maxTokens: 30,
      temperature: 0.3,
    });

    const rawTitle =
      response.choices?.[0]?.message?.content
        ?.toString()
        .trim()
        .replace(/^["']|["']$/g, '') || '';

    if (!rawTitle || rawTitle.length < 2 || rawTitle.length > 100) {
      log.warn(`[content-title] AI title rejected (length=${rawTitle?.length})`);
      res.json({ success: false, title: null });
      return;
    }

    log.info(`[content-title] Generated title: "${rawTitle}"`);
    res.json({ success: true, title: rawTitle });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error(`[content-title] Failed: ${err.message}`);
    res.status(500).json({ success: false, error: 'Title generation failed' });
  }
});

export default contentTitleRouter;
