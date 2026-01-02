import express, { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_text_adj');
const router: Router = express.Router();

interface TextAdjustmentRequestBody {
  originalText: string;
  modification: string;
  fullText: string;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { originalText, modification, fullText } = req.body as TextAdjustmentRequestBody;

  if (!originalText || !modification || !fullText) {
    res.status(400).json({ error: 'originalText, modification und fullText sind erforderlich.' });
    return;
  }

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: `Du bist ein hilfreicher Assistent, der eine verbesserte Formulierung für einen gegebenen Textabschnitt basierend auf den vom Benutzer angegebenen Änderungen vorschlägt. Berücksichtige dabei den gesamten Kontext des Textes, um sicherzustellen, dass der geänderte Abschnitt sich nahtlos in den Gesamttext einfügt. Stelle sicher, dass der Vorschlag klar, prägnant und stilistisch konsistent mit dem Originaltext ist.`,
      messages: [
        {
          role: "user",
          content: `Hier ist der gesamte Text:

"${fullText}"

Der Benutzer möchte folgenden Abschnitt ändern: "${originalText}"

Die gewünschte Änderung lautet: "${modification}"

Bitte schlage eine verbesserte Version des Abschnitts vor, die die gewünschten Änderungen berücksichtigt und sich nahtlos in den Gesamttext einfügt. Gib nur den reinen Textvorschlag für den zu ändernden Abschnitt ohne Einleitungen oder andere Formatierungen zurück.`
        }
      ],
      options: {
        max_tokens: 1024,
        temperature: 0.5
      },

    }, req);

    if (result.success) {
      res.json({ suggestions: [result.content.trim()] });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    log.error('Fehler bei der KI-Anfrage:', error);
    res.status(500).json({
      error: 'Fehler bei der Verarbeitung der KI-Anfrage',
      details: (error as Error).message
    });
  }
});

export default router;
