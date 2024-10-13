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
    const { originalText, modification } = req.body;
    console.log('Original Text:', originalText);
    console.log('Modification:', modification);

    if (!originalText || !modification) {
      return res.status(400).json({ error: 'originalText und modification sind erforderlich.' });
    }

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        temperature: 0.5,
        system: `Du bist ein hilfreicher Assistent, der eine verbesserte Formulierung für einen gegebenen Satz oder Absatz basierend auf den vom Benutzer angegebenen Änderungen vorschlägt. Stelle sicher, dass der Vorschlag klar, prägnant und stilistisch konsistent mit dem Originaltext ist.`,
        messages: [
          {
            role: "user",
            content: `Hier ist ein Text: "${originalText}" Der Benutzer möchte Folgendes ändern: "${modification}" Bitte schlage eine verbesserte Version des obigen Textes vor, die die gewünschten Änderungen berücksichtigt. Gib nur den reinen Textvorschlag ohne Einleitungen oder andere Formatierungen zurück.`
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