// src/routes/claude_text_adjustment.js
const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config(); // Lädt die .env Datei

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.route('/')
  .post(async (req, res) => {
    const { originalText, modification, fullText } = req.body;


    if (!originalText || !modification || !fullText) {
      return res.status(400).json({ error: 'originalText, modification und fullText sind erforderlich.' });
    }

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        temperature: 0.5,
        system: `Du bist ein hilfreicher Assistent, der eine verbesserte Formulierung für einen gegebenen Textabschnitt basierend auf den vom Benutzer angegebenen Änderungen vorschlägt. Berücksichtige dabei den gesamten Kontext des Textes, um sicherzustellen, dass der geänderte Abschnitt sich nahtlos in den Gesamttext einfügt. Stelle sicher, dass der Vorschlag klar, prägnant und stilistisch konsistent mit dem Originaltext ist.`,
        messages: [
          {
            role: "user",
            content: `Hier ist der gesamte Text:

"${fullText}"

Der Benutzer möchte folgenden Abschnitt ändern: "${originalText}"

Die gewünschte Änderung lautet: "${modification}"

Bitte schlage eine verbesserte Version des Abschnitts vor, die die gewünschten Änderungen berücksichtigt und sich nahtlos in den Gesamttext einfügt. Gib nur den reinen Textvorschlag für den zu ändernden Abschnitt ohne Einleitungen oder andere Formatierungen zurück.`
          }
        ]
      });

      if (response && response.content && response.content[0] && response.content[0].text) {
        const suggestion = response.content[0].text.trim();
        res.json({ suggestions: [suggestion] });
      } else {
        console.error('Unerwartete API-Antwortstruktur:', response);
        res.status(500).json({ error: 'Unerwartete API-Antwortstruktur' });
      }
    } catch (error) {
      console.error('Fehler bei der Claude API:', error.response ? error.response.data : error.message);
      res.status(500).json({ error: 'Interner Serverfehler' });
    }
  });

module.exports = router;
