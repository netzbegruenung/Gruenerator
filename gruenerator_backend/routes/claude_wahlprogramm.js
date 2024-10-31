const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.post('/', async (req, res) => {
  const { thema, details, zeichenanzahl } = req.body;
  console.log('Using API Key:', process.env.CLAUDE_API_KEY);

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      temperature: 0.3,
      system: `Du bist Schreiber des Wahlprogramms einer Gliederung von Bündnis 90/Die Grünen.`,
      messages: [
        {
          role: "user",
          content: `Erstelle ein Kapitel für ein Wahlprogramm zum Thema ${thema} im Stil des vorliegenden Dokuments.

Berücksichtige dabei folgende Details und Schwerpunkte:
${details}

Das Kapitel soll etwa ${zeichenanzahl} Zeichen umfassen.

Beachte dabei folgende Punkte:

1. Beginne mit einer kurzen Einleitung (2-3 Sätze), die die Bedeutung des Themas hervorhebt.
2. Gliedere den Text in 3-4 Unterkapitel mit jeweils aussagekräftigen Überschriften.
3. Jedes Unterkapitel sollte 2-3 Absätze umfassen und mindestens eine konkrete politische Forderung oder einen Lösungsvorschlag enthalten.
4. Verwende eine klare, direkte Sprache ohne Fachbegriffe. Nutze das "Wir" und aktive Formulierungen wie "Wir wollen..." oder "Wir setzen uns ein für...".
5. Kritisiere bestehende Missstände, bleibe aber insgesamt optimistisch und lösungsorientiert.

Beachte zusätzlich diese sprachlichen Aspekte:
- Zukunftsorientierte und inklusive Sprache
- Betonung von Dringlichkeit
- Positive Verstärkung
- Verbindende Elemente
- Konkrete Beispiele
- Starke Verben
- Abwechslungsreicher Satzbau`
        }
      ]
    });

    if (response && response.content && Array.isArray(response.content)) {
      const textContent = response.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('');
      
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
