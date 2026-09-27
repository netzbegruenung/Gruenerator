import express, { type Router, type Request, type Response } from 'express';

import { aiText } from '../../services/ai/generate.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('texte/adjustment');
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
    const suggestion = await aiText({
      lane: 'text_adjustment',
      system: `Du bist ein hilfreicher Assistent, der eine verbesserte Formulierung für einen gegebenen Textabschnitt basierend auf den vom Benutzer angegebenen Änderungen vorschlägt. Berücksichtige dabei den gesamten Kontext des Textes, um sicherzustellen, dass der geänderte Abschnitt sich nahtlos in den Gesamttext einfügt. Stelle sicher, dass der Vorschlag klar, prägnant und stilistisch konsistent mit dem Originaltext ist.`,
      prompt: `Hier ist der gesamte Text:

"${fullText}"

Der Benutzer möchte folgenden Abschnitt ändern: "${originalText}"

Die gewünschte Änderung lautet: "${modification}"

Bitte schlage eine verbesserte Version des Abschnitts vor, die die gewünschten Änderungen berücksichtigt und sich nahtlos in den Gesamttext einfügt. Gib nur den reinen Textvorschlag für den zu ändernden Abschnitt ohne Einleitungen oder andere Formatierungen zurück.`,
      temperature: 0.5,
    });

    res.json({ suggestions: [suggestion] });
  } catch (error) {
    log.error('Fehler bei der KI-Anfrage:', error);
    res.status(500).json({
      error: 'Fehler bei der Verarbeitung der KI-Anfrage',
      details: (error as Error).message,
    });
  }
});

export default router;
