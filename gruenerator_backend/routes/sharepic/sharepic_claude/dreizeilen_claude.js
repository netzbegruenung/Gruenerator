const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  console.log('[3Zeilen-Claude API] Received request:', req.body);
  const { thema, details, line1, line2, line3, useBackupProvider } = req.body;

  try {
    console.log('[3Zeilen-Claude API] Preparing request to Claude API');
    const xmlPrompt = `
<context>
Du bist ein erfahrener Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kurze, prägnante Slogans für Sharepics zu erstellen.
</context>

<instructions>
Erstelle 5 verschiedene prägnante, zusammenhängende Slogans zum gegebenen Thema. Jeder Slogan soll:
- Einen durchgängigen Gedanken oder eine Botschaft über drei Zeilen vermitteln
- Die Werte der Grünen widerspiegeln
- Inspirierend und zukunftsorientiert sein
- Für eine breite Zielgruppe geeignet sein
- Fachbegriffe und komplexe Satzkonstruktionen vermeiden
</instructions>

<format>
- Formuliere jeden Slogan als einen zusammenhängenden Satz oder Gedanken
- Teile jeden Satz auf drei Zeilen auf
- Maximal 15 Zeichen pro Zeile, inklusive Leerzeichen
- Die Slogans sollten auch beim Lesen über die Zeilenumbrüche hinweg Sinn ergeben und flüssig sein
- Vermeide Bindestriche oder andere Satzzeichen am Ende der Zeilen
- Gib die Slogans im Format "Slogan 1:", "Slogan 2:" etc. aus
- Schlage zusätzlich ein Wort als Suchbegriff für ein passendes Unsplash-Hintergrundbild vor
- Das Bild soll präzise zum Thema passen
</format>

<examples>
<example>
<input>
Thema: Klimaschutz
Details: Fokus auf erneuerbare Energien
</input>
<output>
Slogan 1:
Grüne Energie
gestaltet heute
unsere Zukunft

Slogan 2:
Sonnenkraft und
Windenergie
bewegen uns

Slogan 3:
Klimaschutz ist
der Weg in die
neue Zukunft

Slogan 4:
Gemeinsam für
saubere Kraft
von morgen

Slogan 5:
Naturenergie
schafft Wandel
für uns alle

Suchbegriff: Windkraft, Solaranlage
</output>
</example>
</examples>

<task>
${thema && details 
  ? `Erstelle nun fünf verschiedene Slogans basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`
  : `Optimiere diese Zeilen zu fünf verschiedenen Slogans:
<input>
Zeile 1: ${line1}
Zeile 2: ${line2}
Zeile 3: ${line3}
</input>`}
</task>
`;

    console.log('[3Zeilen-Claude API] Sending request to Claude API with prompt:', xmlPrompt);
    
    if (!req.app.locals.aiWorkerPool) {
      throw new Error('AI Worker Pool nicht initialisiert');
    }

    const aiResponse = await req.app.locals.aiWorkerPool.processRequest({
      type: 'dreizeilen',
      systemPrompt: `Du bist ein erfahrener Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kurze, prägnante Slogans für Sharepics zu erstellen.`,
      messages: [{
        role: "user",
        content: xmlPrompt
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        temperature: 1.0
      },
      useBackupProvider
    });

    console.log('[3Zeilen-Claude API] Received response from Claude API:', aiResponse);

    if (!aiResponse || !aiResponse.success) {
      throw new Error(aiResponse?.error || 'Keine gültige Antwort von der AI erhalten');
    }

    const textContent = aiResponse.content;
    console.log('[3Zeilen-Claude API] Processed text content:', textContent);

    // Extrahiere die Slogans und den Suchbegriff
    const lines = textContent.split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');

    const slogans = [];
    let currentSlogan = {};
    let lineCount = 0;

    for (const line of lines) {
      if (line.startsWith('Slogan')) {
        if (lineCount > 0) {
          slogans.push({ ...currentSlogan });
        }
        currentSlogan = {};
        lineCount = 0;
        continue;
      }

      if (line.startsWith('Suchbegriff:')) {
        if (lineCount > 0) {
          slogans.push({ ...currentSlogan });
        }
        break;
      }

      if (line && !line.startsWith('Slogan') && lineCount < 3) {
        const lineKey = `line${lineCount + 1}`;
        currentSlogan[lineKey] = line;
        lineCount++;
      }
    }

    const searchTermsLine = lines.find(line => line.startsWith('Suchbegriff:'));
    const searchTerms = searchTermsLine 
      ? searchTermsLine.replace('Suchbegriff:', '').split(',').map(term => term.trim())
      : [];

    const response = {
      mainSlogan: slogans[0] || { line1: '', line2: '', line3: '' },
      alternatives: slogans.slice(1),
      searchTerms
    };

    res.json(response);
  } catch (error) {
    console.error('[3Zeilen-Claude API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Fehler bei der Dreizeilen-Generierung'
    });
  }
});

module.exports = router;