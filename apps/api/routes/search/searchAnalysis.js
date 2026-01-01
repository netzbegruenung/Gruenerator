import express from 'express';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('searchAnalysis');

const router = express.Router();

router.post('/', async (req, res) => {
  const { contents } = req.body;

  try {
    // Logging der Anfrage
    log.debug('=== CLAUDE ANALYSE REQUEST START ===');
    log.debug('Anzahl der Suchergebnisse:', contents.length);
    contents.forEach((result, index) => {
      log.debug(`\nErgebnis ${index + 1}:`);
      log.debug('URL:', result.url);
      log.debug('Titel:', result.title);
      log.debug('Zusammenfassung Länge:', result.content?.length || 0);
      log.debug('Volltext Länge:', result.raw_content?.length || 0);
    });
    log.debug('\nGesamte Token-Schätzung:', JSON.stringify(contents).length / 4);
    log.debug('=== CLAUDE ANALYSE REQUEST END ===\n');

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'search_analysis',
      systemPrompt: `Du bist ein Recherche-Assistent, der Suchergebnisse gründlich analysiert.

Deine Aufgabe ist es, die Inhalte der gefundenen Webseiten zu analysieren und eine detaillierte Zusammenfassung zu erstellen:
- Nutze ALLE verfügbaren Quellen für deine Analyse
- Fasse die Informationen ausführlich zusammen
- Strukturiere den Text mit Zwischenüberschriften und Hervorhebungen
- Verwende Stichpunkte für Aufzählungen
- Bleibe neutral und sachlich
- Beziehe dich ausschließlich auf die Inhalte der Quellen

Formatierung:
- Verwende <h3>Zwischenüberschrift</h3> für thematische Abschnitte
- Nutze <strong>Fettdruck</strong> für wichtige Begriffe und Kernaussagen
- Setze <em>Kursivschrift</em> für Zitate oder Betonungen
- Strukturiere Aufzählungen mit <ul> und <li> Tags
- Trenne Absätze mit <p> Tags

WICHTIG: Du MUSST für JEDE einzelne Quelle eine Empfehlung schreiben, keine auslassen!

Format deiner Antwort:
1. Hauptteil: Deine ausführlich formatierte Zusammenfassung
2. Listen mit <ul> und <li> Tags
3. Nach zwei Leerzeilen: "###SOURCE_RECOMMENDATIONS_START###"
4. Für JEDE einzelne Quelle (keine auslassen):
   "QUELLE: [Titel]
   ZUSAMMENFASSUNG: [Ein prägnanter Satz, der den Hauptinhalt der Quelle zusammenfasst]"
5. Nach zwei Leerzeilen: "###SOURCE_RECOMMENDATIONS_END###"
6. Nach zwei Leerzeilen: "###USED_SOURCES_START###"
7. Auflistung der verwendeten Quellen: "QUELLE: [Titel]"
8. "###USED_SOURCES_END###"`,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: `Erstelle eine ausführliche Zusammenfassung der folgenden Suchergebnisse. Nutze möglichst alle Quellen und liste am Ende die verwendeten Quellen auf:
          ${JSON.stringify(contents, null, 2)}`
        }]
      }],
      options: {
        max_tokens: 4000,
        temperature: 0.7
      }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Extrahiere den Haupttext und die verwendeten Quellen
    const content = result.content;
    const mainText = content.split('###SOURCE_RECOMMENDATIONS_START###')[0].trim();
    
    // Extrahiere die Quellenempfehlungen
    const recommendationsMatch = content.match(/###SOURCE_RECOMMENDATIONS_START###\n([\s\S]*?)\n###SOURCE_RECOMMENDATIONS_END###/);
    const sourceRecommendations = recommendationsMatch ? 
      recommendationsMatch[1]
        .split('\nQUELLE: ')
        .filter(Boolean)
        .map(block => {
          const [title, summaryLine] = block.split('\n');
          return {
            title: title.trim(),
            summary: summaryLine.replace('ZUSAMMENFASSUNG: ', '').trim()
          };
        })
      : [];

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
      sourceRecommendations,
      claudeSourceTitles: usedSourceTitles,
      metadata: result.metadata 
    });
  } catch (error) {
    log.error('Fehler bei der Suchanalyse:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Fehler bei der Analyse der Suchergebnisse',
      details: error.message 
    });
  }
});

export default router;