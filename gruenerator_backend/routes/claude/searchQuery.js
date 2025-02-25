const express = require('express');
const router = express.Router();

/**
 * Endpunkt zum Generieren einer Suchanfrage basierend auf Antragsinformationen
 */
router.post('/search-query', async (req, res) => {
  const { idee, details, gliederung } = req.body;

  // Logging der Anfrage
  console.log('Suchanfrage-Anfrage erhalten:', {
    idee: idee?.substring(0, 50) + (idee?.length > 50 ? '...' : ''),
    details: details?.substring(0, 50) + (details?.length > 50 ? '...' : ''),
    gliederung,
    timestamp: new Date().toISOString()
  });

  if (!idee) {
    console.warn('Fehlende Idee für Suchanfrage');
    return res.status(400).json({ 
      error: 'Fehlende Eingabedaten',
      details: 'Idee ist erforderlich'
    });
  }

  try {
    console.log('Sende Suchanfragen-Anfrage an Claude');
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'search-query',
      systemPrompt: 'Du bist ein Experte für politische Recherche.' ,
      messages: [{
        role: "user",
        content: `Ich möchte einen kommunalpolitischen Antrag für Bündnis 90/Die Grünen erstellen und benötige dafür fundierte Informationen. Formuliere eine Suchanfrage als Frage oder Suchbegriff, die mir hilft, relevante Daten und Fakten zu finden:

Thema des Antrags: ${idee}
${details ? `Inhaltliche Details: ${details}` : ''}
${gliederung ? `Gliederung/Kommune: ${gliederung}` : ''}

Deine Suchanfrage sollte:
- Als kurze Frage oder Suchbegriff formuliert sein
- Nicht länger als 1-2 Sätze sein
- Frei von jeglicher Formatierung oder Einleitung sein
- Kein vollständiger Antrag sein, sondern nur eine prägnante Anfrage

Beispiele für gute Suchanfragen:
- "Kosten und Nutzen des Ausbaus von Fahrradwegen in Städten"
- "Wirksamkeit kommunaler Abfallreduzierungsstrategien"
- "Kommunale Förderprogramme für erneuerbare Energien"

Schreibe keinen anderen Text oder Erklärungen.`
      }],
      options: {
        model: "claude-3-7-sonnet-latest",
        max_tokens: 150,
        temperature: 0.2
      }
    });

    if (!result?.success || !result?.content) {
      console.error('Ungültiges Ergebnis von Claude:', result);
      throw new Error('Keine gültige Suchanfrage generiert');
    }

    // Bereinige die Antwort
    const cleanContent = result.content
      .replace(/^["']|["']$/g, '') // Entferne Anführungszeichen
      .trim();

    console.log('Suchanfrage erfolgreich generiert:', {
      query: cleanContent,
      length: cleanContent.length,
      processingTime: result.metadata?.processingTime || 'nicht verfügbar',
      timestamp: new Date().toISOString()
    });

    res.json({ 
      content: cleanContent,
      metadata: {
        type: 'search-query',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Fehler bei der Suchanfragengenerierung:', error);
    
    // Strukturierte Fehlerantwort
    res.status(500).json({ 
      error: 'Fehler bei der Generierung der Suchanfrage',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 