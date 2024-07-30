const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.post('/', async (req, res) => {
  console.log('[3Zeilen-Claude API] Received request:', req.body);
  const { thema, details, line1, line2, line3 } = req.body;

  try {
    console.log('[3Zeilen-Claude API] Preparing request to Claude API');
    const prompt = thema && details
      ? `Erstelle ein prägnanten, kurzen slogan für ein Sharepic von Bündnis 90/Die Grünen in einem Satz zum Thema "${thema}" basierend auf folgenden Details: ${details}. Teile diesen einen SLogan auf drei zeilen auf. Gib nur die drei Zeilen aus, ohne Nummerierung oder zusätzlichen Text.`
      : `teile ihn ungefähr gleichmäßig auf diese drei Zeilen auf. Line3 darf etwas kürzer sein.:\n1. ${line1}\n2. ${line2}\n3. ${line3}\nGib nur die optimierten Zeilen aus, ohne Nummerierung oder zusätzlichen Text.`;

    console.log('[3Zeilen-Claude API] Sending request to Claude API with prompt:', prompt);
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      temperature: 0.9,
      system: "Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, einen sehr kurzen, prägnanten text, der auf ein sharepic gesetzt wird, zu generieren. Er wird auf drei Zeilen aufgeteilt. Es soll ein kurzer, prägnanter SLogan sein, der auf drei Zeilen aufgeteilt wird. Maximallänge pro Zeile sind 15 Zeichen.",
      messages: [{ role: "user", content: prompt }]
    });

    console.log('[3Zeilen-Claude API] Received response from Claude API:', response);

    if (response && response.content && Array.isArray(response.content)) {
      const textContent = response.content.map(item => item.text).join("\n");
      console.log('[3Zeilen-Claude API] Processed text content:', textContent);
      
      // Extrahiere die drei Zeilen, entferne Nummerierungen und leere Zeilen
      const lines = textContent.split('\n')
        .map(line => line.replace(/^\d+\.?\s*/, '').trim())
        .filter(line => line !== '')
        .slice(0, 3);
      
      const result = {
        line1: lines[0] || '',
        line2: lines[1] || '',
        line3: lines[2] || ''
      };
      
      console.log('[3Zeilen-Claude API] Sending response:', result);
      res.json(result);
    } else {
      console.error('[3Zeilen-Claude API] API response missing or incorrect content structure:', response);
      res.status(500).send('API response missing or incorrect content structure');
    }
  } catch (error) {
    console.error('[3Zeilen-Claude API] Error with Claude API:', error.response ? error.response.data : error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;