// src/routes/claude_text_adjustment.js
const express = require('express');
const { createLogger } = require('../utils/logger.js');
const log = createLogger('claude_text_adj');

const router = express.Router();

router.post('/', async (req, res) => {
  const { originalText, modification, fullText } = req.body;

  if (!originalText || !modification || !fullText) {
    return res.status(400).json({ error: 'originalText, modification und fullText sind erforderlich.' });
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
      details: error.message 
    });
  }
});

module.exports = router;
