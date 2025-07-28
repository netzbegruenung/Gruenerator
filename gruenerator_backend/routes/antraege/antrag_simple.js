const express = require('express');
const router = express.Router();
const { 
  HTML_FORMATTING_INSTRUCTIONS,
  TITLE_GENERATION_INSTRUCTION,
  processResponseWithTitle
} = require('../../utils/promptUtils');
const { processBundestagDocuments } = require('../../utils/bundestagUtils');

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
  const { requestType, idee, details, gliederung, useBedrock, customPrompt, useWebSearchTool, useBundestagApi, selectedBundestagDocuments } = req.body;
  
  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  try {
    // Logging der Anfrage
    console.log('Einfache Antrag-Anfrage erhalten:', {
      requestType: requestType || 'antrag',
      idee: idee?.substring(0, 50) + (idee?.length > 50 ? '...' : ''),
      hasCustomPrompt: !!customPrompt,
      useBedrock: useBedrock,
      useWebSearchTool: useWebSearchTool,
      useBundestagApi: useBundestagApi
    });

    // Validiere die Eingabedaten
    if (!customPrompt && !idee) {
      return res.status(400).json({ 
        error: 'Fehlende Eingabedaten',
        details: 'Idee oder ein benutzerdefinierter Prompt ist erforderlich'
      });
    }

    // Bundestag API Integration - Use selected documents with full text
    let bundestagDocuments = null;
    if (useBundestagApi && selectedBundestagDocuments && selectedBundestagDocuments.length > 0) {
      try {
        const processedDocs = await processBundestagDocuments(selectedBundestagDocuments);
        bundestagDocuments = processedDocs.enhancedDocuments;
      } catch (error) {
        console.error('Bundestag document processing error (non-critical):', error.message);
        // Continue without parliamentary documents if processing fails
        bundestagDocuments = null;
      }
    }

    console.log('Sende vereinfachte Anfrage an Claude' + 
      (useWebSearchTool ? ' mit Web Search Tool' : '') + 
      (useBundestagApi && bundestagDocuments ? ` mit ${bundestagDocuments.totalResults} parlamentarischen Dokumenten` : ''));
    
    // Configure tools and system prompt based on web search usage
    const tools = useWebSearchTool ? [webSearchTool] : [];
    
    // Base system prompt
    let systemPrompt = 'Du bist ein erfahrener Kommunalpolitiker von Bündnis 90/Die Grünen. ';
    
    // Add request type specific instructions
    if (requestType === 'kleine_anfrage') {
      systemPrompt += 'Erstelle eine KLEINE ANFRAGE nach kommunalrechtlichen Standards. ';
      systemPrompt += 'Kleine Anfragen dienen der präzisen Fachinformation, sind schriftlich und punktuell. ';
      systemPrompt += 'Verwende folgenden Aufbau: 1) Betreff (max. 120 Zeichen), 2) Kurze Begründung (3-4 Sätze mit Rechtsgrundlage), 3) Nummerierte präzise Fragen (max. 3-5 Hauptfragen), 4) Erbetene Antwortform und Frist. ';
      systemPrompt += 'Formuliere neutral und sachlich ohne Wertungen. ';
    } else if (requestType === 'grosse_anfrage') {
      systemPrompt += 'Erstelle eine GROSSE ANFRAGE nach kommunalrechtlichen Standards. ';
      systemPrompt += 'Große Anfragen behandeln politisch bedeutsame Gesamtthemen umfassend mit höherer Öffentlichkeitswirkung. ';
      systemPrompt += 'Verwende folgenden Aufbau: 1) Betreff (aussagekräftig), 2) Ausführliche Begründung mit politischem Kontext, 3) Nummerierte Fragen-Cluster (Hauptfragen mit Unterfragen), 4) Bitte um schriftliche UND mündliche Behandlung im Rat. ';
      systemPrompt += 'Die Anfrage soll das Thema umfassend beleuchten und eine Debatte im Rat ermöglichen. ';
    } else {
      systemPrompt += 'Entwirf einen kommunalpolitischen ANTRAG basierend auf der gegebenen Idee. ';
      systemPrompt += 'Der Antrag muss folgende Struktur haben: 1) Betreff, 2) Antragstext mit konkreten Beschlussvorschlägen, 3) Ausführliche Begründung. ';
    }
    
    // Add web search instructions if enabled
    if (useWebSearchTool) {
      systemPrompt += 'Nutze die Websuche, wenn du aktuelle Informationen oder Fakten benötigst. Zitiere deine Quellen. ';
    }
    
    // Add parliamentary documents instructions if available
    if (useBundestagApi && bundestagDocuments && bundestagDocuments.totalResults > 0) {
      systemPrompt += 'Du hast Zugang zu relevanten parlamentarischen Dokumenten (Drucksachen und Plenarprotokolle) aus dem Bundestag. Nutze diese Informationen, um den Antrag zu fundieren und auf bereits diskutierte oder beschlossene Themen zu verweisen. Zitiere spezifische Dokumente mit ihrer Nummer und dem Datum. ';
    }
    
    systemPrompt += 'WICHTIG: Gib nur den finalen deutschen Text aus, keine englischen Zwischenschritte oder Gedankengänge. Beginne direkt mit dem fertigen Dokument.';
    
    // Format parliamentary documents if available
    const { formatDocumentsForPrompt } = require('../../utils/bundestagUtils');
    const parlamentaryDocsText = useBundestagApi && bundestagDocuments ? formatDocumentsForPrompt(bundestagDocuments) : '';
    
    // Erstelle den Benutzerinhalt basierend auf dem Vorhandensein eines benutzerdefinierten Prompts
    let userContent;
    
    if (customPrompt) {
      // Prüfe ob es sich um strukturierte Anweisungen/Wissen handelt
      const isStructured = customPrompt.includes('Der User gibt dir folgende Anweisungen') || 
                          customPrompt.includes('Der User stellt dir folgendes, wichtiges Wissen');
      
      if (isStructured) {
        // Strukturierte Anweisungen und Wissen direkt verwenden
        userContent = `${customPrompt}

---

Aktuelles Datum: ${currentDate}

Zusätzliche Informationen (falls relevant):
${idee ? `- Antragsidee: ${idee}` : ''}
${gliederung ? `- Gliederung: ${gliederung}` : ''}
${details ? `- Details: ${details}` : ''}

${parlamentaryDocsText}

Der Antrag sollte eine klare Struktur mit Betreff, Antragstext und Begründung haben.

WICHTIG: Antworte ausschließlich auf Deutsch. Gib nur den finalen Antrag aus, keine Zwischenschritte oder Erklärungen.

${HTML_FORMATTING_INSTRUCTIONS}`;
      } else {
        // Legacy: Bei benutzerdefiniertem Prompt diesen verwenden, aber mit Standardinformationen ergänzen
        userContent = `Benutzerdefinierter Prompt: ${customPrompt}

Aktuelles Datum: ${currentDate}

Zusätzliche Informationen (falls relevant):
${idee ? `- Antragsidee: ${idee}` : ''}
${gliederung ? `- Gliederung: ${gliederung}` : ''}
${details ? `- Details: ${details}` : ''}

${parlamentaryDocsText}

Der Antrag sollte eine klare Struktur mit Betreff, Antragstext und Begründung haben.

WICHTIG: Antworte ausschließlich auf Deutsch. Gib nur den finalen Antrag aus, keine Zwischenschritte oder Erklärungen.

${HTML_FORMATTING_INSTRUCTIONS}`;
      }
    } else {
      // Standardinhalt ohne benutzerdefinierten Prompt
      const requestTypeText = requestType === 'kleine_anfrage' ? 'eine kleine Anfrage' : 
                             requestType === 'grosse_anfrage' ? 'eine große Anfrage' : 
                             'einen kommunalpolitischen Antrag';
                             
      userContent = `Erstelle ${requestTypeText} zum Thema: ${idee}` + 
                   (details ? `\n\nDetails: ${details}` : '') + 
                   (gliederung ? `\n\nFür die Gliederung: ${gliederung}` : '') +
                   `\n\nAktuelles Datum: ${currentDate}` +
                   (parlamentaryDocsText ? `\n\n${parlamentaryDocsText}` : '') +
                   `\n\nWICHTIG: Antworte ausschließlich auf Deutsch. Gib nur das finale Dokument aus, keine Zwischenschritte oder Erklärungen.\n\n${HTML_FORMATTING_INSTRUCTIONS}`;
    }
    
    // Add title generation instruction to user content
    userContent += TITLE_GENERATION_INSTRUCTION;
    
    // Simple debug logging for prompt visualization
    console.log('\n📄 [ANTRAG DEBUG] Vollständiger Prompt:');
    console.log('System:', systemPrompt);
    console.log('User Content:', userContent);
    console.log('─'.repeat(50));
    
    // Anfrage an Claude
    const payload = {
      systemPrompt,
      messages: [{
        role: "user",
        content: userContent
      }],
      tools,
      options: {
        temperature: 0.3,
        useBedrock: useBedrock
      }
    };
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antrag',
      ...payload
    });

    if (!result.success) {
      console.error('Fehler bei Claude-Anfrage:', result.error);
      throw new Error(result.error);
    }
    
    // Process response with title generation and preserve existing metadata
    const processedResult = processResponseWithTitle(result, '/antraege/antrag_simple', { requestType, idee, details, gliederung });
    const responseData = {
      content: processedResult.content,
      metadata: {
        ...processedResult.metadata,
        webSearchUsed: useWebSearchTool || false,
        bundestagApiUsed: useBundestagApi || false,
        bundestagDocumentsUsed: bundestagDocuments ? bundestagDocuments.totalResults : 0
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