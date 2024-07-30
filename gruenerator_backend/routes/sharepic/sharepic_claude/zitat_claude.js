const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.post('/', async (req, res) => {
  console.log('[Zitat-Claude API] Received request:', req.body);
  const { thema, details, quote, name } = req.body;

  try {
    console.log('[Zitat-Claude API] Preparing request to Claude API');
    const prompt = thema && details
      ? `Erstelle ein Zitat zum Thema "${thema}" basierend auf folgenden Details: ${details}. Ist unter Details kein Inhalt, nimm nur das Thema.`
      : `Optimiere folgendes Zitat: "${quote}" - ${name}`;

    console.log('[Zitat-Claude API] Sending request to Claude API with prompt:', prompt);
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      temperature: 0.7,
      system: "Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, ein prägnantes und aussagekräftige Zitat mit maximal 140 Zeichen im STil von Bündnis 90/Die Grünen zu erstellen.",
      messages: [{ role: "user", content: prompt }]
    });

    console.log('[Zitat-Claude API] Received reasponse from Claude API:', response);

    if (response && response.content && Array.isArray(response.content)) {
      const textContent = response.content.map(item => item.text).join("\n");
      console.log('[Zitat-Claude API] Processed text content:', textContent);
      
      // Extrahiere Zitat (ohne Anführungszeichen und einleitende Sätze)
      const extractedQuote = textContent.replace(/^.*?["„]|[""]$/g, '').trim();
      
      const result = {
        quote: extractedQuote,
        name: 'Bündnis 90/Die Grünen'
      };
      
      console.log('[Zitat-Claude API] Sending response:', result);
      res.json(result);
    } else {
      console.error('[Zitat-Claude API] API response missing or incorrect content structure:', response);
      res.status(500).send('API response missing or incorrect content structure');
    }
  } catch (error) {
    console.error('[Zitat-Claude API] Error with Claude API:', error.response ? error.response.data : error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;