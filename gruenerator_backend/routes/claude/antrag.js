const express = require('express');
const router = express.Router();

/**
 * Endpunkt zum Generieren eines Antrags mit oder ohne Websuche-Ergebnisse
 */
router.post('/antrag', async (req, res) => {
  const { idee, details, gliederung, searchResults, useWebSearch, useBackupProvider, customPrompt } = req.body;
  
  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  try {
    // Logging der Anfrage (ohne vollständige Suchergebnisse)
    console.log('Antrag-Anfrage erhalten:', {
      idee: idee?.substring(0, 50) + (idee?.length > 50 ? '...' : ''),
      useWebSearch,
      searchResultsCount: searchResults?.length || 0,
      hasCustomPrompt: !!customPrompt
    });

    // Validiere die Eingabedaten
    if (!customPrompt && !idee) {
      return res.status(400).json({ 
        error: 'Fehlende Eingabedaten',
        details: 'Idee oder ein benutzerdefinierter Prompt ist erforderlich'
      });
    }

    // Formatiere die Suchergebnisse für bessere Lesbarkeit
    let searchResultsText = '';
    if (useWebSearch && searchResults && searchResults.length > 0) {
      searchResultsText = searchResults.map((result, index) => {
        return `Quelle ${index + 1}: ${result.title}
URL: ${result.url}
Inhalt: ${result.content}`;
      }).join('\n\n');
    }

    // Anthropic-Standard: Kurzer, klarer systemPrompt
    const systemPrompt = 'Du bist ein erfahrener Kommunalpolitiker von Bündnis 90/Die Grünen. Deine Aufgabe ist es, präzise und professionelle politische Anträge zu verfassen.';

    // Erstelle den Benutzerinhalt basierend auf dem Vorhandensein eines benutzerdefinierten Prompts
    let userContent;
    
    if (customPrompt) {
      // Bei benutzerdefiniertem Prompt diesen verwenden, aber mit Standardinformationen ergänzen
      userContent = `Benutzerdefinierter Prompt: ${customPrompt}

Aktuelles Datum: ${currentDate}

Zusätzliche Informationen (falls relevant):
${idee ? `- Antragsidee: ${idee}` : ''}
${gliederung ? `- Gliederung: ${gliederung}` : ''}
${details ? `- Details: ${details}` : ''}

Der Antrag muss folgende Struktur haben:
1. Betreff: Eine prägnante Überschrift
2. Antragstext: Konkrete Beschlussvorschläge
3. Begründung: Warum der Antrag wichtig ist`;

      // Wenn Websuche-Ergebnisse vorhanden sind, füge sie hinzu
      if (useWebSearch && searchResultsText) {
        userContent += `\n\nHier sind relevante Rechercheergebnisse:\n\n${searchResultsText}`;
      }
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = useWebSearch 
        ? `Erstelle einen kommunalpolitischen Antrag zum Thema "${idee}"${gliederung ? ` für die Gliederung "${gliederung}"` : ''}${details ? ` mit folgenden Details: "${details}"` : ''}.

Aktuelles Datum: ${currentDate}

Hier sind relevante Rechercheergebnisse:

${searchResultsText}

Der Antrag muss folgende Struktur haben:
1. Betreff: Eine prägnante Überschrift
2. Antragstext: Konkrete Beschlussvorschläge
3. Begründung: Warum der Antrag wichtig ist, untermauert durch die Rechercheergebnisse`
        : `Erstelle einen kommunalpolitischen Antrag zum Thema "${idee}"${gliederung ? ` für die Gliederung "${gliederung}"` : ''}${details ? ` mit folgenden Details: "${details}"` : ''}.

Aktuelles Datum: ${currentDate}

Der Antrag muss folgende Struktur haben:
1. Betreff: Eine prägnante Überschrift
2. Antragstext: Konkrete Beschlussvorschläge
3. Begründung: Warum der Antrag wichtig ist`;
    }

    console.log('Sende Anfrage an Claude mit Prompt-Länge:', userContent.length);
    
    // Anthropic-Standard: Korrekte Struktur der API-Anfrage
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antrag',
      systemPrompt,
      messages: [
        {
          role: "user",
          content: userContent
        }
      ],
      options: {
        model: "claude-3-7-sonnet-latest",
        max_tokens: 4000,
        temperature: 0.3
      },
      useBackupProvider
    });

    if (!result.success) {
      console.error('Fehler bei Claude-Anfrage:', result.error);
      throw new Error(result.error);
    }
    
    res.json({ 
      content: result.content,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Fehler bei der Antragserstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Antrags',
      details: error.message
    });
  }
});

module.exports = router; 