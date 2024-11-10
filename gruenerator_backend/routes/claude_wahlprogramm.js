const express = require('express');
const router = express.Router();
const AIRequestManager = require('../utils/AIRequestManager');

router.post('/', async (req, res) => {
  const { thema, details, zeichenanzahl } = req.body;

  try {
    const result = await AIRequestManager.processRequest({
      type: 'wahlprogramm',
      systemPrompt: 'Du bist Schreiber des Wahlprogramms einer Gliederung von Bündnis 90/Die Grünen.',
      prompt: `Erstelle ein Kapitel für ein Wahlprogramm zum Thema ${thema} im Stil des vorliegenden Dokuments.

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
- Abwechslungsreicher Satzbau`,
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 0.3
      }
    });

    if (!result.success) throw new Error(result.error);
    res.json({ content: result.result });
  } catch (error) {
    console.error('Fehler bei der Wahlprogramm-Erstellung:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
