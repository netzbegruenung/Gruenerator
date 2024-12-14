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
Erstelle einen prägnanten, zusammenhängenden Slogan zum gegebenen Thema. Der Slogan soll:
- Einen durchgängigen Gedanken oder eine Botschaft über drei Zeilen vermitteln
- Die Werte der Grünen widerspiegeln
- Inspirierend und zukunftsorientiert sein
- Für eine breite Zielgruppe geeignet sein
- Fachbegriffe und komplexe Satzkonstruktionen vermeiden
</instructions>

<format>
- Formuliere den Slogan als einen zusammenhängenden Satz oder Gedanken
- Teile diesen Satz auf drei Zeilen auf
- Maximal 15 Zeichen pro Zeile, inklusive Leerzeichen
- Der Slogan sollte auch beim Lesen über die Zeilenumbrüche hinweg Sinn ergeben und flüssig sein
- Vermeide Bindestriche oder andere Satzzeichen am Ende der Zeilen
- Gib nur die drei Zeilen aus, ohne Nummerierung oder zusätzlichen Text
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
Grüne Energie
gestaltet heute
unsere Zukunft
Suchbegriff: Windkraft
</output>
</example>

<example>
<input>
Thema: Soziale Gerechtigkeit
Details: Chancengleichheit in der Bildung
</input>
<output>
Bildung befähigt
jedes Kind zur
besten Zukunft
Suchbegriff: Klassenzimmer 
</output>
</example>
</examples>

<task>
${thema && details 
  ? `Erstelle nun einen zusammenhängenden Slogan basierend auf folgendem Input:
<input>
Thema: ${thema}
Details: ${details}
</input>`
  : `Optimiere diese Zeilen zu einem zusammenhängenden Slogan:
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

    // Extrahiere die drei Zeilen und den Suchbegriff
    const lines = textContent.split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');

    const response = {
      line1: lines[0] || '',
      line2: lines[1] || '',
      line3: lines[2] || '',
      searchTerms: lines[3] ? lines[3].replace('Suchbegriff:', '').split(',').map(term => term.trim()) : []
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