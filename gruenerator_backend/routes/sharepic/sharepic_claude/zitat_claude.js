const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  console.log('[Zitat-Claude API] Received request:', req.body);
  const { thema, details, quote, name, useBackupProvider } = req.body;

  try {
    console.log('[Zitat-Claude API] Preparing request to Claude API');
    const prompt = thema && details
      ? `Erstelle 5 verschiedene Zitate zum Thema "${thema}" basierend auf folgenden Details: ${details}. Ist unter Details kein Inhalt, nimm nur das Thema. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`
      : `Optimiere folgendes Zitat: "${quote}" und erstelle 4 weitere Varianten. Gib die Zitate in einem JSON-Array zurück, wobei jedes Objekt ein "quote" Feld hat.`;

    console.log('[Zitat-Claude API] Sending request to Claude API with prompt:', prompt);
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'zitat',
      systemPrompt: "Du bist ein erfahrener Social-Media-Manager für Bündnis 90/Die Grünen. Deine Aufgabe ist es, prägnante und aussagekräftige Zitate mit maximal 140 Zeichen im Stil von Bündnis 90/Die Grünen zu erstellen. Gib die Zitate immer als JSON-Array zurück.",
      messages: [{ 
        role: "user", 
        content: prompt 
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1000,
        temperature: 0.7
      },
      useBackupProvider
    });

    console.log('[Zitat-Claude API] Received response from Claude API:', result);

    if (result.success) {
      const textContent = result.content;
      console.log('[Zitat-Claude API] Processed text content:', textContent);
      
      // Versuche JSON zu parsen
      let quotes = [];
      try {
        // Extrahiere JSON aus der Antwort
        const jsonMatch = textContent.match(/\[.*\]/s);
        if (jsonMatch) {
          quotes = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: Extrahiere einzelne Zitate
          quotes = textContent
            .split(/\d+\./)
            .map(q => q.trim())
            .filter(q => q)
            .map(q => ({
              quote: q.replace(/^.*?["„]|[""]$/g, '').trim()
            }));
        }
      } catch (error) {
        console.error('[Zitat-Claude API] Error parsing quotes:', error);
        // Fallback: Verwende das erste gefundene Zitat
        const extractedQuote = textContent
          .replace(/^.*?["„]|[""]$/g, '')
          .replace(/^(Hier ist ein (mögliches )?Zitat|Ein Zitat).*?:/i, '')
          .trim();
        quotes = [{ quote: extractedQuote }];
      }
      
      // Stelle sicher, dass wir maximal 5 Zitate haben
      quotes = quotes.slice(0, 5);
      
      const resultObj = {
        alternatives: quotes,
        quote: quotes[0].quote
      };
      
      console.log('[Zitat-Claude API] Sending response:', resultObj);
      res.json(resultObj);
    } else {
      throw new Error(result.error || 'Fehler bei der Zitat-Generierung');
    }
  } catch (error) {
    console.error('[Zitat-Claude API] Error with Claude API:', error.response ? error.response.data : error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;