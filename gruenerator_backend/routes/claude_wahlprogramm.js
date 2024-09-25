const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

router.route('/')
  .post(async (req, res) => {
    const { thema, details, ort, gliederung, zeichenzahl } = req.body;
    console.log('Using API Key:', process.env.CLAUDE_API_KEY);
    console.log('Received request:', req.body);

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.7,
        system: "Du bist Schreiber des Wahlprogramms einer Gliederung von Bündnis 90/Die Grünen.",
        messages: [
          {
            role: "user",
            content: `Erstelle ein Kapitel für ein Wahlprogramm zum Thema: ${thema}

Details zum Thema: ${details}
Ort/Region: ${ort}
Gliederung: ${gliederung}
Gewünschte Zeichenzahl: ${zeichenzahl}

Beachte dabei folgende Punkte:

1. Beginne mit einer kurzen Einleitung (2-3 Sätze), die die Bedeutung des Themas hervorhebt.
2. Gliedere den Text in 3-4 Unterkapitel mit jeweils aussagekräftigen Überschriften.
3. Jedes Unterkapitel sollte 2-3 Absätze umfassen und mindestens eine konkrete politische Forderung oder einen Lösungsvorschlag enthalten.
4. Verwende eine klare, direkte Sprache ohne Fachbegriffe. Nutze das "Wir" und aktive Formulierungen wie "Wir wollen..." oder "Wir setzen uns ein für...".
5. Kritisiere bestehende Missstände, bleibe aber insgesamt optimistisch und lösungsorientiert.
6. Das Kapitel sollte insgesamt etwa die angegebene Zeichenzahl umfassen.

Beachte folgende Hinweise für die Sprache:
1. Zukunftsorientierte Sprache: Verwende Formulierungen, die Zukunftsorientierung ausdrücken.
2. Betonung von Dringlichkeit: Nutze Ausdrücke, die die Dringlichkeit von Handlungen unterstreichen.
3. Inklusive Sprache: Achte auf geschlechtergerechte Formulierungen.
4. Positive Verstärkung: Betone positive Auswirkungen von Vorschlägen.
5. Verbindende Elemente: Verwende Formulierungen, die Zusammenhalt betonen.
6. Kontrastierende Sprache: Stelle gelegentlich den eigenen Ansatz anderen gegenüber.
7. Konkrete Beispiele: Illustriere abstrakte Konzepte mit konkreten Beispielen oder Szenarien.
8. Rhetorische Fragen: Nutze gelegentlich rhetorische Fragen, um Denkanstöße zu geben.
9. Starke Verben: Verwende aktive, starke Verben.
10. Metaphern und Bilder: Setze gelegentlich prägnante Metaphern ein.
11. Wiederholung von Schlüsselbegriffen: Wiederhole zentrale Begriffe und Konzepte.
12. Abwechslungsreicher Satzbau: Variiere zwischen kurzen, prägnanten Sätzen und längeren, erklärenden Satzstrukturen.

Berücksichtige bei der Erstellung des Wahlprogramm-Kapitels die spezifischen Details, den Ort/die Region und die Gliederung, die angegeben wurden.`
          }
        ]
      });

      if (response && response.content && Array.isArray(response.content)) {
        const textContent = response.content.map(item => item.text).join("\n");
        res.json({ generatedContent: textContent });
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
