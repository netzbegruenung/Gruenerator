const express = require('express');
const router = express.Router();
const { HTML_FORMATTING_INSTRUCTIONS } = require('../../utils/promptUtils');

// Web Search Tool Configuration
const webSearchTool = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
  user_location: {
    type: "approximate",
    country: "DE",
    timezone: "Europe/Berlin"
  }
};

/**
 * Vereinfachter Endpunkt zum Generieren eines Antrags mit optionaler Websuche
 */
router.post('/', async (req, res) => {
  // Extract useWebSearchTool along with other flags
  const { idee, details, gliederung, useBackupProvider, useBedrock, customPrompt, useWebSearchTool } = req.body;
  
  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  try {
    // Logging der Anfrage
    console.log('Einfache Antrag-Anfrage erhalten:', {
      idee: idee?.substring(0, 50) + (idee?.length > 50 ? '...' : ''),
      hasCustomPrompt: !!customPrompt,
      useBedrock: useBedrock,
      useWebSearchTool: useWebSearchTool
    });

    // Validiere die Eingabedaten
    if (!customPrompt && !idee) {
      return res.status(400).json({ 
        error: 'Fehlende Eingabedaten',
        details: 'Idee oder ein benutzerdefinierter Prompt ist erforderlich'
      });
    }

    console.log('Sende vereinfachte Anfrage an Claude' + (useWebSearchTool ? ' mit Web Search Tool' : ''));
    
    // Configure tools and system prompt based on web search usage
    const tools = useWebSearchTool ? [webSearchTool] : [];
    const systemPrompt = useWebSearchTool 
      ? 'Du bist ein erfahrener Kommunalpolitiker von Bündnis 90/Die Grünen. Nutze die Websuche, wenn du aktuelle Informationen oder Fakten für den Antrag benötigst. Zitiere deine Quellen im Antrag. WICHTIG: Gib nur den finalen deutschen Antrag aus, keine englischen Zwischenschritte oder Gedankengänge. Beginne direkt mit dem Antrag.'
      : 'Du bist Kommunalpolitiker einer Gliederung von Bündnis 90/Die Grünen. Entwirf einen Antrag basierend auf der gegebenen Idee.';
    
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

Der Antrag sollte eine klare Struktur mit Betreff, Antragstext und Begründung haben.

WICHTIG: Antworte ausschließlich auf Deutsch. Gib nur den finalen Antrag aus, keine Zwischenschritte oder Erklärungen.

${HTML_FORMATTING_INSTRUCTIONS}`;
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      userContent = `Erstelle einen kommunalpolitischen Antrag zum Thema: ${idee}` + 
                   (details ? `\n\nDetails: ${details}` : '') + 
                   (gliederung ? `\n\nFür die Gliederung: ${gliederung}` : '') +
                   `\n\nAktuelles Datum: ${currentDate}` +
                   `\n\nDer Antrag muss folgende Struktur haben:
1. Betreff: Eine prägnante Überschrift
2. Antragstext: Konkrete Beschlussvorschläge
3. Begründung: Warum der Antrag wichtig ist

WICHTIG: Antworte ausschließlich auf Deutsch. Gib nur den finalen Antrag aus, keine Zwischenschritte oder Erklärungen.

${HTML_FORMATTING_INSTRUCTIONS}`;
    }
    
    // Anfrage an Claude
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antrag',
      systemPrompt,
      messages: [{
        role: "user",
        content: userContent
      }],
      tools,
      options: {
        temperature: 0.3,
        useBedrock: useBedrock
      },
      useBackupProvider
    });

    if (!result.success) {
      console.error('Fehler bei Claude-Anfrage:', result.error);
      throw new Error(result.error);
    }
    
    // Enhanced response with web search metadata
    const responseData = {
      content: result.content,
      metadata: {
        ...result.metadata,
        webSearchUsed: useWebSearchTool || false
      }
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Fehler bei der einfachen Antragserstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Antrags',
      details: error.message
    });
  }
});

module.exports = router; 