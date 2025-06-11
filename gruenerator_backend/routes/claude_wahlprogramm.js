const express = require('express');
const router = express.Router();
const { HTML_FORMATTING_INSTRUCTIONS } = require('../utils/promptUtils');

router.post('/', async (req, res) => {
  const { thema, details, zeichenanzahl, useBackupProvider } = req.body;

  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  const systemPrompt = 'Du bist Schreiber des Wahlprogramms einer Gliederung von Bündnis 90/Die Grünen.';
  const userContent = `Erstelle ein Kapitel für ein Wahlprogramm zum Thema ${thema} im Stil des vorliegenden Dokuments.

Aktuelles Datum: ${currentDate}

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
- Abwechslungsreicher Satzbau

${HTML_FORMATTING_INSTRUCTIONS}`;

  const payload = {
    systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    options: {
      max_tokens: 4000,
      temperature: 0.3
    },
    useBackupProvider
  };
  
  try {
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'wahlprogramm',
      systemPrompt: payload.systemPrompt,
      prompt: userContent, // Worker expects 'prompt' for this type
      options: payload.options,
      useBackupProvider: payload.useBackupProvider
    });

    if (!result.success) throw new Error(result.error);
    res.json({ 
      content: result.content,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Fehler bei der Wahlprogramm-Erstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Wahlprogramms',
      details: error.message
    });
  }
});

module.exports = router;
