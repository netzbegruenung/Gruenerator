const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  const { contents } = req.body;

  try {
    // Logging der Anfrage
    console.log('=== CLAUDE ANALYSE REQUEST START ===');
    console.log('Anzahl der Suchergebnisse:', contents.length);
    contents.forEach((result, index) => {
      console.log(`\nErgebnis ${index + 1}:`);
      console.log('URL:', result.url);
      console.log('Titel:', result.title);
      console.log('Zusammenfassung Länge:', result.content?.length || 0);
      console.log('Volltext Länge:', result.raw_content?.length || 0);
    });
    console.log('\nGesamte Token-Schätzung:', JSON.stringify(contents).length / 4);
    console.log('=== CLAUDE ANALYSE REQUEST END ===\n');

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'search_analysis',
      systemPrompt: `Du bist ein Recherche-Assistent, der Suchergebnisse gründlich analysiert.

Deine Aufgabe ist es, die Inhalte der gefundenen Webseiten zu analysieren und eine detaillierte Zusammenfassung zu erstellen:
- Nutze möglichst alle verfügbaren Quellen
- Fasse die Informationen ausführlich zusammen
- Strukturiere den Text in logische Absätze
- Verwende Stichpunkte für Aufzählungen
- Bleibe neutral und sachlich
- Beziehe dich ausschließlich auf die Inhalte der Quellen

Format deiner Antwort:
1. Hauptteil: Deine ausführliche Zusammenfassung
2. Listen mit "- " beginnen, durch Leerzeilen getrennt
3. Nach zwei Leerzeilen: "###USED_SOURCES_START###"
4. Auflistung der verwendeten Quellen: "QUELLE: [Titel]"
5. "###USED_SOURCES_END###"`,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: `Erstelle eine ausführliche Zusammenfassung der folgenden Suchergebnisse. Nutze möglichst alle Quellen und liste am Ende die verwendeten Quellen auf:
          ${JSON.stringify(contents, null, 2)}`
        }]
      }],
      options: {
        model: "claude-3-5-sonnet-20240620",
        temperature: 0.3
      }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Extrahiere den Haupttext und die verwendeten Quellen
    const content = result.content;
    const mainText = content.split('###USED_SOURCES_START###')[0].trim();
    const sourcesMatch = content.match(/###USED_SOURCES_START###\n([\s\S]*?)\n###USED_SOURCES_END###/);
    const usedSourceTitles = sourcesMatch ? 
      sourcesMatch[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('QUELLE: '))
        .map(line => line.replace('QUELLE: ', ''))
      : [];

    res.json({ 
      status: 'success',
      analysis: mainText,
      claudeSourceTitles: usedSourceTitles,
      metadata: result.metadata 
    });
  } catch (error) {
    console.error('Fehler bei der Suchanalyse:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Fehler bei der Analyse der Suchergebnisse',
      details: error.message 
    });
  }
});

module.exports = router; 