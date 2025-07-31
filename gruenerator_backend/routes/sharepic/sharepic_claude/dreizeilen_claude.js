const express = require('express');
const router = express.Router();

// Unified handler for both dreizeilen and zitat types
const handleClaudeRequest = async (req, res, type = 'dreizeilen') => {
  const logPrefix = type === 'dreizeilen' ? '[3Zeilen-Claude API]' : '[Zitat-Claude API]';
  console.log(`${logPrefix} Received request:`, req.body);
  
  const { thema, details, line1, line2, line3, quote, name } = req.body;

  try {
    console.log(`${logPrefix} Preparing request to Claude API`);
    
    // Generate type-specific prompt and AI request parameters
    let aiRequest;
    
    if (type === 'dreizeilen') {
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

      aiRequest = {
        type: 'dreizeilen',
        systemPrompt: `Du bist ein erfahrener Texter für Bündnis 90/Die Grünen. Deine Aufgabe ist es, kurze, prägnante Slogans für Sharepics zu erstellen.`,
        messages: [{
          role: "user",
          content: xmlPrompt
        }],
        options: {
          max_tokens: 4000,
          temperature: 1.0
        }
      };
    } else {
      // Zitat type
      const prompt = thema && details
        ? `Erstelle 4 verschiedene Zitate zum Thema "${thema}" basierend auf folgenden Details: ${details}. Ist unter Details kein Inhalt, nimm nur das Thema. Die Zitate sollen KEINE Hashtags enthalten und als klare, aussagekräftige Statements formuliert sein. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`
        : `Optimiere folgendes Zitat: "${quote}" und erstelle 3 weitere Varianten. Die Zitate sollen KEINE Hashtags enthalten und als klare, aussagekräftige Statements formuliert sein. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`;

      aiRequest = {
        type: 'zitat',
        systemPrompt: "Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, prägnante und aussagekräftige Zitate mit maximal 140 Zeichen im Stil von Bündnis 90/Die Grünen zu erstellen. Die Zitate sollen KEINE Hashtags enthalten und als klare, lesbare Aussagen formuliert sein. Gib die Zitate immer als JSON-Array zurück.",
        messages: [{ 
          role: "user", 
          content: prompt 
        }],
        options: {
          max_tokens: 1000,
          temperature: 0.7
        }
      };
    }

    console.log(`${logPrefix} Sending request to Claude API with prompt:`, aiRequest.messages[0].content);
    
    if (!req.app.locals.aiWorkerPool) {
      throw new Error('AI Worker Pool nicht initialisiert');
    }

    const aiResponse = await req.app.locals.aiWorkerPool.processRequest(aiRequest);

    console.log(`${logPrefix} Received response from Claude API:`, aiResponse);

    if (!aiResponse || !aiResponse.success) {
      throw new Error(aiResponse?.error || 'Keine gültige Antwort von der AI erhalten');
    }

    const textContent = aiResponse.content;
    console.log(`${logPrefix} Processed text content:`, textContent);

    // Type-specific response processing
    let response;
    
    if (type === 'dreizeilen') {
      // Process dreizeilen response - extract slogans and search terms
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

      response = {
        mainSlogan: slogans[0] || { line1: '', line2: '', line3: '' },
        alternatives: slogans.slice(1),
        searchTerms
      };
    } else {
      // Process zitat response - extract quotes from JSON
      let quotes = [];
      try {
        // Extract JSON from response
        const jsonMatch = textContent.match(/\[.*\]/s);
        if (jsonMatch) {
          quotes = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: Extract individual quotes
          quotes = textContent
            .split(/\d+\./)
            .map(q => q.trim())
            .filter(q => q)
            .map(q => ({
              quote: q.replace(/^.*?["„]|[""]$/g, '').trim()
            }));
        }
      } catch (error) {
        console.error(`${logPrefix} Error parsing quotes:`, error);
        // Fallback: Use first found quote
        const extractedQuote = textContent
          .replace(/^.*?["„]|[""]$/g, '')
          .replace(/^(Hier ist ein (mögliches )?Zitat|Ein Zitat).*?:/i, '')
          .trim();
        quotes = [{ quote: extractedQuote }];
      }
      
      // Ensure max 4 quotes
      quotes = quotes.slice(0, 4);
      
      response = {
        alternatives: quotes,
        quote: quotes[0]?.quote || ''
      };
    }

    console.log(`${logPrefix} Sending response:`, response);
    res.json(response);
  } catch (error) {
    console.error(`${logPrefix} Error:`, error.message);
    const errorMessage = type === 'dreizeilen' 
      ? 'Fehler bei der Dreizeilen-Generierung'
      : 'Fehler bei der Zitat-Generierung';
    
    if (type === 'dreizeilen') {
      res.status(500).json({
        success: false,
        error: error.message || errorMessage
      });
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
};

// Route handlers for both types
router.post('/', async (req, res) => {
  await handleClaudeRequest(req, res, 'dreizeilen');
});

// Export both the router and the handler for external use
module.exports = router;
module.exports.handleClaudeRequest = handleClaudeRequest;