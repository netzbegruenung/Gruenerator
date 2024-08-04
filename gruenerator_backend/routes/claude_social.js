const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.route('/')
  .post(async (req, res) => {
    const { thema, details } = req.body;
    console.log('Using API Key:', process.env.CLAUDE_API_KEY);

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.9,
        system: `Du bist Social-Media-Manager von Bündnis 90/Die Grünen. Mache einen Vorschlag für einen Social-Media Beitragstext eine Social-Media-Aktion. Der User gibt dir Thema und Details. Gib nur den Inhalt wieder.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Thema: ${thema}
Details: ${details}
Erstelle einen Social-Media-Beitrag zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Der Beitrag sollte:

1. Kurz und prägnant sein (2-4 Absätze)
2. Informelle, bürgernahe Sprache im "Du"-Stil verwenden
3. Mit einer Einleitung beginnen, gefolgt von Details
4. Emojis zur Strukturierung nutzen
5. Mit einem Aufruf zum Handeln oder einer Frage enden
6. Einen engagierten, positiven Ton haben
7. Aspekte wie Vielfalt und Nachhaltigkeit betonen

Gib anschließend 2-3 einfache Aktionsideen für Social Media`
              }
            ]
          }
        ]
      });

      if (response && response.content && Array.isArray(response.content)) {
        const textContent = response.content.map(item => item.text).join("\n");
        res.json({ content: textContent });
      } else {
        console.error('API response missing or incorrect content structure:', response);
        res.status(500).send('API response missing or incorrect content structure');
      }
    } catch (error) {
      console.error('Error with Claude API:', error.response ? error.response.data : error.message);
      res.status(500).send('Internal Server Error');
    }
  });

module.exports = router;