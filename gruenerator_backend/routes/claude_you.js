const express = require('express');
const router = express.Router();

/**
 * Endpunkt für das Grünerator U Feature
 * Analysiert den Prompt und ordnet ihn einer passenden Kategorie zu
 */
router.post('/', async (req, res) => {
  const { prompt, useBackupProvider } = req.body;

  try {
    // Logging der Anfrage
    console.log('You-Anfrage erhalten:', {
      promptLength: prompt?.length || 0,
      promptPreview: prompt?.substring(0, 50) + (prompt?.length > 50 ? '...' : '')
    });

    // Validiere den Prompt
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Fehlende Eingabedaten',
        details: 'Prompt ist erforderlich'
      });
    }

    // Systemanweisung für die Kategorisierung
    const systemPrompt = `Du bist ein Assistent für politische Inhalte von Bündnis 90/Die Grünen. 
Deine Aufgabe ist es, Anfragen zu analysieren und zu kategorisieren, damit sie vom passenden Spezialmodell bearbeitet werden können.`;

    // Anfrage an Claude zur Kategorisierung
    const categorizationResult = await req.app.locals.aiWorkerPool.processRequest({
      type: 'you_categorization',
      systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analysiere die folgende Anfrage und ordne sie einer der folgenden Kategorien zu:
1. "social" - für Social Media und Pressetexte
2. "antrag" - für kommunalpolitische Anträge
3. "wahlprogramm" - für Wahlprogramm-Kapitel
4. "rede" - für politische Reden
5. "universal" - für allgemeine Anfragen, die in keine der anderen Kategorien passen

Gib nur den Kategorienamen zurück, ohne weitere Erklärungen.

Anfrage: "${prompt}"`
        }
      ],
      options: {
        model: "claude-3-7-sonnet-latest",
        max_tokens: 50,
        temperature: 0.1
      },
      useBackupProvider
    });

    if (!categorizationResult.success) {
      console.error('Fehler bei der Kategorisierung:', categorizationResult.error);
      throw new Error(categorizationResult.error);
    }

    // Extrahiere die Kategorie (entferne Anführungszeichen und Leerzeichen)
    const category = categorizationResult.content.trim().toLowerCase().replace(/["']/g, '');
    console.log('Erkannte Kategorie:', category);

    // Sende die Kategorie und den ursprünglichen Prompt zurück
    res.json({ 
      category: category,
      originalPrompt: prompt
    });
    
  } catch (error) {
    console.error('Fehler bei der You-Anfrage:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Verarbeitung der Anfrage',
      details: error.message
    });
  }
});

module.exports = router; 