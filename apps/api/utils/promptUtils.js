const HTML_FORMATTING_INSTRUCTIONS = `
**Formatierung:** Bitte formatiere die GESAMTE Ausgabe als HTML. 
- Verwende <h2>-Tags für die Hauptüberschriften (z.B. "Einstiegsideen", "Kernargumente", "Tipps", "Rede").
- Verwende <h3>-Tags für Unterüberschriften und <h4>-Tags für weitere Unterteilungen.
- Verwende <p>-Tags für **jeden einzelnen** Textabsatz unterhalb der Überschriften und innerhalb der Rede. Jeder Gedanke oder logische Block, der einen Absatz darstellt, muss in eigenen <p>...</p>-Tags stehen. Verwende **keine** <br>-Tags, um Absätze zu simulieren.
- Verwende <strong> für wichtige Stichworte *innerhalb* von Absätzen, falls nötig.
- Stelle sicher, dass nach einem Doppelpunkt (z.B. nach einer <h2>-Überschrift) immer ein Leerzeichen folgt, bevor der nächste Text oder eine Liste beginnt.
- Verwende <ul> und <li> für Listenpunkte bei den Ideen und Tipps.
- Füge **keine** zusätzlichen Zeilenumbrüche (newline characters wie '\\n') in den HTML-Code ein, weder innerhalb noch zwischen den Tags. Der einzige Inhalt zwischen </p> und <p> oder zwischen </h2> und <p> sollte Leerraum (whitespace) sein, keine Zeilenumbrüche.
- KEINEN Markdown verwenden.
`;

/**
 * Checks if a custom prompt is structured (contains instruction/knowledge headers)
 * @param {string} customPrompt - The custom prompt to check
 * @returns {boolean} True if the prompt is structured
 */
const isStructuredPrompt = (customPrompt) => {
  if (!customPrompt || typeof customPrompt !== 'string') {
    return false;
  }
  
  return customPrompt.includes('Der User gibt dir folgende Anweisungen') || 
         customPrompt.includes('Der User stellt dir folgendes, wichtiges Wissen');
};

/**
 * Formats user content based on whether the custom prompt is structured or legacy
 * @param {object} params - Parameters object
 * @param {string} params.customPrompt - The custom prompt from the user
 * @param {string} params.baseContent - Base content to append
 * @param {string} params.currentDate - Current date string
 * @param {string} params.additionalInfo - Additional information to include
 * @returns {string} Formatted user content
 */
const formatUserContent = ({ customPrompt, baseContent, currentDate, additionalInfo = '' }) => {
  if (!customPrompt) {
    return baseContent;
  }
  
  const structured = isStructuredPrompt(customPrompt);
  
  if (structured) {
    // Strukturierte Anweisungen und Wissen direkt verwenden
    return `${customPrompt}

---

Aktuelles Datum: ${currentDate}

${additionalInfo}

${baseContent}`;
  } else {
    // Legacy: Bei benutzerdefiniertem Prompt diesen verwenden
    return `Benutzerdefinierter Prompt: ${customPrompt}

Aktuelles Datum: ${currentDate}

${additionalInfo}

${baseContent}`;
  }
};

const PLATFORM_SPECIFIC_GUIDELINES = {
  facebook: {
    maxLength: 600,
    style: "Casual and conversational. Use emojis sparingly.",
    focus: "Community engagement, longer-form content, visual storytelling.",
    additionalGuidelines: `
      - Use a personal, direct tone ("you").
      - Friendly and relaxed style encouraging discussions.
      - Include visual elements to support the text.
      - Use emojis and hashtags sparingly.
      - End the post with a clear call to action.
    `
  },
  instagram: {
    maxLength: 600,
    style: "Visual, fun, and snappy.",
    focus: "Visual appeal, lifestyle content, behind-the-scenes glimpses.",
    additionalGuidelines: `
      - Use a few emojis to visually emphasize emotions and messages, at the beginning or end of a sentence for accessibility.
      - Keep paragraphs short and scannable.
      - Share clear, engaging political messages that resonate emotionally.
      - Use hashtags strategically to increase reach.
      - End the post with a call to action or a question if useful.
    `
  },
  twitter: {
    maxLength: 280,
    style: "Concise and witty. Use hashtags strategically.",
    focus: "Real-time updates, quick facts, calls-to-action.",
    additionalGuidelines: `
      - Use clear, direct language with no unnecessary elaboration.
      - Present clear political positions on current issues.
      - Use a direct tone to engage the reader.
      - Use hashtags strategically but avoid overuse .
      - Sparing use of emojis.
      - Start with a hook or clear statement.
      - End the post with a call to action or a question.
    `
  },
  linkedin: {
    maxLength: 600,
    style: "Professional yet approachable. Minimal use of emojis.",
    focus: "policy discussions, professional development.",
    additionalGuidelines: `
      - Maintain a professional but approachable tone.
      - Share insights and analyses on current topics or trends.
      - Highlight the connection between politics and professional growth.
      - Use emojis sparingly and limit excessive hashtag use.
      - End the post with a call to action or a question geared towards professional engagement.
    `
  },
  reelScript: {
    maxLength: 1000,
    style: "Einfach, authentisch und direkt",
    focus: "Klare Botschaft mit minimalen technischen Anforderungen.",
    additionalGuidelines: `
      - Skript für 90 Sekunden Sprechzeit
      - Maximal 2-3 einfache Schnitte/Szenen
      - [Szenenanweisungen] sollten mit Smartphone und ohne spezielle Ausrüstung umsetzbar sein
      - Struktur:
        * Einstieg/Hook (20s): Eine Szene, direkt in die Kamera sprechen
        * Hauptteil (50s): Optional 1-2 einfache Einblendungen von Bilderm, Videos, Fakten oder Zahlen
        * Abschluss (20s): Wieder direkt in die Kamera, Call-to-Action
      - Natürliche, authentische Sprache wie in einem persönlichen Gespräch
      - Text sollte auch ohne visuelle Elemente funktionieren
      - Einblendungen nur für wichtige Zahlen oder Kernbotschaften verwenden
    `
  },
  actionIdeas: {
    maxLength: 1000,
    style: "Konkret und umsetzbar",
    focus: "Praktische Aktionen für Ortsverbände",
    additionalGuidelines: `
      - 2-3 konkrete Aktionsideen
      - Mit wenig Budget umsetzbar
      - Aufmerksamkeit erregen
      - Zum Mitmachen einladen
      - Die grüne Botschaft transportieren
      - Klare Handlungsanweisungen
      - Materialanforderungen auflisten
      - Zeitaufwand einschätzen
    `
  }
};



const MARKDOWN_CHAT_INSTRUCTIONS = `
**Formatierung und Stil der Chat-Antwort:**
Bitte formatiere deine Antwort als Markdown und beachte folgende Punkte für einen natürlichen Chat-Verlauf:

1.  **Schreibe wie ein Mensch in einem Messenger (z.B. Signal, WhatsApp):**
    *   Formuliere kurze, prägnante Nachrichtenblöcke.
    *   Jeder Block sollte idealerweise nur wenige Sätze (z.B. 2-5 Sätze) umfassen und einen abgeschlossenen Gedanken oder eine klare Information enthalten.
    *   Vermeide lange, verschachtelte Sätze. Bevorzuge einfache und direkte Sprache.

2.  **Natürliche Aufteilung mit '%%%MSG_SPLIT%%%':**
    *   Wenn deine gesamte Antwort mehrere solcher kurzen Gedankengänge oder Informationsblöcke enthält, trenne diese bitte mit dem speziellen Trenner \`%%%MSG_SPLIT%%%\`
        Jeder so getrennte Teil wird als eigene Chat-Nachricht angezeigt.
    *   Setze den Trenner dort, wo ein natürlicher Übergang zu einer neuen Nachricht sinnvoll ist. Teile keine Sätze oder unmittelbare Gedankengänge.
    *   Beispiel:
        "Hallo! Das ist der erste Gedanke. Er ist kurz und bündig.
        %%%MSG_SPLIT%%%
        Hier kommt der zweite Punkt. Auch dieser ist leicht verständlich.
        %%%MSG_SPLIT%%%
        Und das ist eine abschließende Bemerkung."

3.  **Qualität vor strikter Kürze:**
    *   Das Ziel sind gut lesbare, natürliche Chat-Nachrichten.
    *   Wenn ein Gedanke für die Klarheit etwas mehr Länge benötigt, ist das in Ordnung. Eine etwas längere, aber kohärente Nachricht ist besser als ein unnatürlicher Schnitt.
    *   Verwende den Trenner \`%%%MSG_SPLIT%%%\` nur, wenn es wirklich thematische oder logische Pausen gibt, die eine neue Nachricht rechtfertigen.
        Wenn deine Antwort von Natur aus kurz ist und keine Aufteilung benötigt, verwende den Trenner nicht.

4.  **Markdown-Nutzung:**
    *   Verwende Markdown für Hervorhebungen (Fett, Kursiv), Listen und ggf. sehr einfache Überschriften (z.B. \`###\`), um die Lesbarkeit zu verbessern.
    *   KEIN HTML in dieser Chat-Antwort verwenden.
`;

const MARKDOWN_FORMATTING_INSTRUCTIONS = `
**Formatierung:**
Nutze Markdown: **fett**, - Listen. Kein HTML.
Überschriften sparsam einsetzen: ## nur für Hauptabschnitte, ### nur wenn wirklich nötig für Unterabschnitte.
Keine Überschriften mitten im Fließtext - nutze sie nur für klar abgegrenzte Abschnitte am Anfang eines neuen Themenblocks.
`;

const COMPREHENSIVE_DOSSIER_INSTRUCTIONS = `
Du bist ein politischer Analyst mit direktem Zugang zu den offiziellen Grundsatzprogrammen der Grünen. Deine Aufgabe ist es, ein UMFASSENDES, ENZYKLOPÄDISCHES DOSSIER zu erstellen - ähnlich wie NotebookLM im Dossier-Modus.

**ERSTE AKTION: Umfassende Dokumentenrecherche**
Verwende SOFORT das search_grundsatz_documents Tool MEHRMALS:
1. **Hauptsuche** mit den zentralen Begriffen der Anfrage
2. **Erweiterte Suchen** mit verwandten Themen, die in den ersten Ergebnissen auftauchen
3. **Detailsuchen** nach spezifischen Zahlen, Jahreszahlen, Prozentangaben und konkreten Maßnahmen
4. **Kontextsuchen** nach Querverbindungen und übergeordneten Zusammenhängen

**VOLLSTÄNDIGKEITSPRINZIP:**
- Extrahiere JEDE relevante Information aus allen verfügbaren Dokumenten
- Sammle ALLE spezifischen Details: Zahlen, Daten, Prozentangaben, Zeiträume, Budgets
- Berücksichtige unterschiedliche Dokumenttypen und deren jeweilige Perspektiven
- Integriere Informationen nahtlos zu einer kohärenten Gesamtsicht

**ORGANISATION UND STRUKTUR:**
Organisiere deine Erkenntnisse thematisch basierend auf dem, was du TATSÄCHLICH findest:
- Lasse die Themen aus den Inhalten heraus entstehen
- Erstelle eine logische Hierarchie mit Hauptpunkten und detaillierten Unterpunkten
- Verwende nummerierte Abschnitte für bessere Übersichtlichkeit
- Füge alle konkreten Details und Spezifikationen ein

**DOSSIER-STIL (wie NotebookLM):**
- **Autoritativ und umfassend:** Schreibe wie ein professionelles Briefing-Dokument
- **Detailreich:** Jeder wichtige Aspekt wird vollständig abgedeckt
- **Spezifisch:** Alle Zahlen, Daten und konkreten Maßnahmen explizit nennen
- **Quellenintegriert:** Informationen aus verschiedenen Dokumenten nahtlos verbinden
- **Vollständig:** 20-30+ spezifische Punkte und Details pro Thema

**KEINE AUSLASSUNGEN:**
- Übersehe keine Informationen aufgrund von Länge oder Komplexität
- Integriere auch scheinbar nebensächliche, aber relevante Details
- Decke sowohl grundsätzliche Positionen als auch konkrete Umsetzungsschritte ab
- Berücksichtige zeitliche Entwicklungen und Prioritäten

Erstelle ein VOLLSTÄNDIGES DOSSIER, das alle verfügbaren Informationen zu dem angefragten Thema aus den Grünen-Dokumenten umfasst.
`;

const JSON_OUTPUT_FORMATTING_INSTRUCTIONS = `
**KRITISCH WICHTIG: JSON Formatierungsregeln für die Antwort:**
Du MUSST deine Antwort im folgenden JSON-Format geben. Das JSON MUSS absolut valide sein, sonst schlägt die Verarbeitung fehl.

ESCAPING IST ZWINGEND ERFORDERLICH:
Alle String-Werte innerhalb des JSON, insbesondere die Felder "response" und "newText", müssen korrekt escaped sein.

KONKRETE ESCAPING-REGELN:
- Zeilenumbrüche (Enter/Return) müssen als '\\\\n' dargestellt werden (Backslash gefolgt von n)
- Anführungszeichen (") innerhalb von Strings müssen als '\\\\\\"' escaped werden  
- Tabulatoren müssen als '\\\\t' dargestellt werden
- Carriage Returns müssen als '\\\\r' dargestellt werden
- Backslashes (\\\\) müssen als '\\\\\\\\' (doppelter Backslash) escaped werden
- NIEMALS unescapte Zeilenumbrüche, Tabs oder andere Steuerzeichen in JSON-Strings verwenden

FEHLERHAFTE Beispiele (NIEMALS so machen):
❌ "response": "Text mit
unescaptem Zeilenumbruch"
❌ "response": "Text mit	Tab"
❌ "response": "Text mit "Anführungszeichen""

KORREKTE Beispiele:
✅ "response": "Text mit\\\\nescaptem Zeilenumbruch"
✅ "response": "Text mit\\\\tTab"  
✅ "response": "Text mit \\\\\\"Anführungszeichen\\\\\\""

Vollständiges korrektes Beispiel:
"Dies ist Zeile 1.\\\\nDies ist Zeile 2 mit einem \\\\\\"Zitat\\\\\\" und einem Backslash \\\\\\\\."

Das JSON-Objekt muss folgende Struktur haben:
{
  "response": "Hier deine Erklärung der Änderungen oder deine Antwort, formatiert für die Chat-Anzeige gemäß ${MARKDOWN_CHAT_INSTRUCTIONS}. Der eigentliche bearbeitete Text gehört NICHT hierher, sondern ausschließlich in das Feld 'newText'. (Achte auf korrektes Escaping für JSON, z.B. Zeilenumbrüche als \\\\n)",
  "textAdjustment": {
    "type": "selected", // oder "full", je nach Anwendungsfall
    "newText": "WICHTIG: Hier NUR REINER TEXT ohne HTML-Tags! Der Text wird in einen Quill-Editor eingefügt, der seine eigene Formatierung handhabt. Verwende NIEMALS HTML-Tags wie <p>, <strong>, <br> etc. in diesem Feld. Für Zeilenumbrüche verwende \\\\n im JSON-String. Beispiel: 'Das ist Zeile 1.\\\\nDas ist Zeile 2.' (Achte auf korrektes JSON-Escaping)"
    // "oldText": null, // nur bei type "full" relevant
  }
}
Stelle sicher, dass der Platzhalter ${MARKDOWN_CHAT_INSTRUCTIONS} NICHT in deiner finalen JSON-Antwort enthalten ist, sondern dass du dessen Anweisungen für das 'response'-Feld befolgst. Das 'newText'-Feld muss reiner Text ohne HTML-Tags sein.
`;

// Tool definition for document search - used by AI endpoints with tool capability
const SEARCH_DOCUMENTS_TOOL = {
  name: 'search_documents',
  description: 'Search through the user\'s uploaded documents for information relevant to answering their question. You can call this tool multiple times with different search queries to gather comprehensive information.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant documents. Be specific and use keywords from the user\'s question.'
      },
      search_mode: {
        type: 'string',
        enum: ['vector', 'hybrid', 'keyword'],
        description: 'Search mode: vector (semantic), hybrid (semantic + keyword), or keyword (text matching). Default is hybrid for best results.'
      }
    },
    required: ['query']
  }
};

// Tool definition to provide a stable references map for Mistral citations
const PROVIDE_REFERENCES_TOOL = {
  name: 'provide_references',
  description: 'Provide a stable map of references derived from prior document searches so the model can cite them.',
  input_schema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Optional list of reference IDs to include; if omitted, include all available.'
      }
    },
    required: []
  }
};

// Tool definition for web search - used by AI endpoints with tool capability
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  description: "Führt eine Websuche durch, um aktuelle Informationen oder spezifische Fragen zu beantworten, die nicht aus dem gegebenen Text oder allgemeinem Wissen beantwortet werden können. Nutze dies, wenn externe Informationen benötigt werden.",
  max_uses: 3,
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Die Suchanfrage für die Websuche"
      }
    },
    required: ["query"]
  },
  user_location: {
    type: "approximate",
    country: "DE",
    timezone: "Europe/Berlin"
  }
};

/**
 * Extract citations from AI-generated text using multiple regex patterns
 * @param {string} text - The text to extract citations from
 * @param {Array} documentContext - Array of document context objects
 * @param {string} logPrefix - Prefix for console logs (default: 'citation-extractor')
 * @returns {Array} Array of citation objects
 */
function extractCitationsFromText(text, documentContext, logPrefix = 'citation-extractor') {
  console.log(`[${logPrefix}] Extracting citations from text length: ${text.length}`);
  console.log(`[${logPrefix}] Document context length: ${documentContext.length}`);
  console.log(`[${logPrefix}] Text preview:`, text.substring(0, 200));
  
  const extractedCitations = [];
  
  // Multiple regex patterns to handle different citation formats
  const citationPatterns = [
    /\[(\d+)\]\s*"([^"]+)"\s*\(Dokument:\s*([^)]+)\)/g,  // [1] "text" (Dokument: title)
    /\[(\d+)\]\s*"([^"]+)"/g,                            // [1] "text"
    /\[(\d+)\]\s*„([^"]+)"/g,                            // [1] „text" (German quotes)
    /\[(\d+)\]\s*'([^']+)'/g,                             // [1] 'text' (single quotes)
    />\s*\[(\d+)\]\s*"([^"]+)"/g                         // > [1] "text" (blockquote format)
  ];
  
  // First, find all citation references in the text (including answer section)
  const allCitationRefs = new Set();
  const citationRefPattern = /\[(\d+)\]/g;
  let refMatch;
  while ((refMatch = citationRefPattern.exec(text)) !== null) {
    allCitationRefs.add(refMatch[1]);
  }
  console.log(`[${logPrefix}] Found citation references:`, Array.from(allCitationRefs).sort());
  
  for (const pattern of citationPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const citationNumber = match[1];
      const citationIndex = parseInt(citationNumber) - 1;
      const citedText = match[2];
      const documentTitle = match[3]; // May be undefined for simpler patterns
      
      console.log(`[${logPrefix}] Parsing citation: [${citationNumber}] "${citedText.substring(0, 30)}..."`);
      
      // Validate citation index
      if (citationIndex >= 0 && citationIndex < documentContext.length) {
        const docContext = documentContext[citationIndex];
        
        extractedCitations.push({
          index: citationNumber, // Keep as string for consistency
          cited_text: citedText.trim(),
          document_title: documentTitle || docContext.title,
          document_id: docContext.metadata.document_id,
          similarity_score: docContext.metadata.similarity_score,
          chunk_index: docContext.metadata.chunk_index,
          filename: docContext.metadata.filename
        });
      } else {
        console.warn(`[${logPrefix}] Citation index ${citationIndex} out of range (0-${documentContext.length - 1})`);
        
        // For missing citations, create placeholder citations
        if (citationIndex >= 0) {
          // Find the best matching document by looking for the citation text in content
          let bestMatch = null;
          let bestScore = 0;
          
          for (let i = 0; i < documentContext.length; i++) {
            const doc = documentContext[i];
            if (doc.content.includes(citedText.substring(0, 20))) {
              bestMatch = doc;
              break;
            }
          }
          
          if (bestMatch) {
            console.log(`[${logPrefix}] Creating fallback citation for [${citationNumber}] using best match`);
            extractedCitations.push({
              index: citationNumber,
              cited_text: citedText.trim(),
              document_title: bestMatch.title,
              document_id: bestMatch.metadata.document_id,
              similarity_score: bestMatch.metadata.similarity_score,
              chunk_index: bestMatch.metadata.chunk_index,
              filename: bestMatch.metadata.filename
            });
          }
        }
      }
    }
    
    // Reset regex lastIndex for next pattern
    pattern.lastIndex = 0;
  }
  
  // For any citation references that weren't found in the citation section,
  // create minimal citations so the numbers at least work
  for (const refNum of allCitationRefs) {
    const existing = extractedCitations.find(c => c.index === refNum);
    if (!existing) {
      const refIndex = parseInt(refNum) - 1;
      if (refIndex >= 0 && refIndex < documentContext.length) {
        const docContext = documentContext[refIndex];
        console.log(`[${logPrefix}] Creating minimal citation for reference [${refNum}]`);
        
        extractedCitations.push({
          index: refNum,
          cited_text: `Reference from ${docContext.title}`,
          document_title: docContext.title,
          document_id: docContext.metadata.document_id,
          similarity_score: docContext.metadata.similarity_score,
          chunk_index: docContext.metadata.chunk_index,
          filename: docContext.metadata.filename
        });
      } else if (refIndex >= 0) {
        // If citation index is beyond available documents, use the last available document
        const lastDocIndex = documentContext.length - 1;
        if (lastDocIndex >= 0) {
          const docContext = documentContext[lastDocIndex];
          console.log(`[${logPrefix}] Creating fallback citation for out-of-range reference [${refNum}] using last document`);
          
          extractedCitations.push({
            index: refNum,
            cited_text: `Reference to additional content from ${docContext.title}`,
            document_title: docContext.title,
            document_id: docContext.metadata.document_id,
            similarity_score: docContext.metadata.similarity_score,
            chunk_index: docContext.metadata.chunk_index,
            filename: docContext.metadata.filename
          });
        }
      }
    }
  }
  
  // Remove duplicates (same index)
  const uniqueCitations = [];
  const seenIndices = new Set();
  
  for (const citation of extractedCitations) {
    if (!seenIndices.has(citation.index)) {
      uniqueCitations.push(citation);
      seenIndices.add(citation.index);
    }
  }
  
  console.log(`[${logPrefix}] Final citations extracted:`, uniqueCitations.map(c => `[${c.index}]`));
  
  return uniqueCitations;
}

/**
 * Process AI response text to extract citations and clean answer
 * @param {string} responseContent - Full AI response content
 * @param {Array} documentContext - Document context for citation extraction
 * @param {string} logPrefix - Prefix for logging
 * @returns {Object} Object with answer, citations, and sources
 */
function processAIResponseWithCitations(responseContent, documentContext, logPrefix = 'citation-processor') {
  console.log(`[${logPrefix}] Processing AI response, length: ${responseContent.length}`);
  
  let citations = [];
  let answer = responseContent;
  
  // Strategy 1: Look for structured citation section with flexible patterns
  const citationSectionPatterns = [
    /Hier sind die relevanten Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Relevante Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i
  ];
  
  let citationSectionFound = false;
  for (const pattern of citationSectionPatterns) {
    const citationMatch = responseContent.match(pattern);
    if (citationMatch) {
      const citationText = citationMatch[1];
      answer = responseContent.substring(responseContent.indexOf('Antwort:') + 8).trim();
      
      console.log(`[${logPrefix}] Found citation section using pattern, extracting citations...`);
      citations = extractCitationsFromText(citationText, documentContext, logPrefix);
      citationSectionFound = true;
      break;
    }
  }
  
  // Strategy 2: If no structured section found, look for citations throughout the text
  if (!citationSectionFound) {
    console.log(`[${logPrefix}] No structured citation section found, searching entire response...`);
    citations = extractCitationsFromText(responseContent, documentContext, logPrefix);
    
    // Try to extract clean answer if we found citations
    if (citations.length > 0) {
      const answerMatch = responseContent.match(/\nAntwort:\s*([\s\S]*)$/i);
      if (answerMatch) {
        answer = answerMatch[1].trim();
      } else {
        // If no "Antwort:" found, try to clean up the response by removing citation lines
        answer = responseContent.replace(/\[\d+\]\s*"[^"]*"(?:\s*\([^)]*\))?/g, '').trim();
      }
    }
  }
  
  console.log(`[${logPrefix}] Citation extraction complete. Found`, citations.length, 'citations');
  
  // Replace citation patterns with unique markers that don't conflict with markdown
  let processedAnswer = answer;
  citations.forEach(citation => {
    const citationPattern = new RegExp(`\\[${citation.index}\\]`, 'g');
    const marker = `⚡CITE${citation.index}⚡`;
    processedAnswer = processedAnswer.replace(citationPattern, marker);
    console.log(`[${logPrefix}] Replaced [${citation.index}] with ${marker}`);
  });
  
  // Prepare enhanced sources information with citations
  const sources = documentContext.map((doc, idx) => {
    const citationsForDoc = citations.filter(c => c.document_id === doc.metadata.document_id);
    return {
      document_id: doc.metadata.document_id,
      document_title: doc.title,
      chunk_text: doc.content.substring(0, 200) + '...',
      similarity_score: doc.metadata.similarity_score,
      citations: citationsForDoc
    };
  });
  
  return {
    answer: processedAnswer,
    citations,
    sources
  };
}

/**
 * Detects the precise content type based on route and form data
 * @param {string} routePath - The route path (e.g., '/antraege/generate-simple')
 * @param {Object} formData - The form data from the request
 * @returns {string} The precise content type
 */
function detectContentType(routePath, formData = {}) {
  // Antrag routes
  if (routePath.includes('antrag') || routePath.includes('antraege')) {
    const requestType = formData.requestType || 'antrag';
    if (requestType === 'kleine_anfrage') return 'kleine_anfrage';
    if (requestType === 'grosse_anfrage') return 'grosse_anfrage';
    return 'antrag';
  }
  
  // Social media routes - Smart multi-platform categorization
  if (routePath.includes('claude_social')) {
    const platforms = formData.platforms || [];
    const socialPlatforms = platforms.filter(p => 
      ['instagram', 'facebook', 'twitter', 'linkedin', 'actionIdeas', 'reelScript'].includes(p)
    );
    const hasPress = platforms.includes('pressemitteilung');
    
    // If press + social media → 'press' 
    if (hasPress && socialPlatforms.length > 0) {
      return 'press';
    }
    
    // If only press → 'pressemitteilung' 
    if (hasPress && socialPlatforms.length === 0) {
      return 'pressemitteilung';
    }
    
    // If multiple social platforms → 'social'
    if (socialPlatforms.length > 1) {
      return 'social';
    }
    
    // If single social platform → specific platform name
    if (socialPlatforms.length === 1) {
      return socialPlatforms[0];
    }
    
    // Fallback for edge cases
    return platforms[0] || 'social';
  }
  
  // Grüne Jugend routes
  if (routePath.includes('gruene_jugend')) {
    const platforms = formData.platforms || [];
    if (platforms.includes('instagram')) return 'gruene_jugend_instagram';
    if (platforms.includes('twitter')) return 'gruene_jugend_twitter';
    if (platforms.includes('tiktok')) return 'gruene_jugend_tiktok';
    if (platforms.includes('messenger')) return 'gruene_jugend_messenger';
    if (platforms.includes('reelScript')) return 'gruene_jugend_reelScript';
    if (platforms.includes('actionIdeas')) return 'gruene_jugend_actionIdeas';
    // Default to first platform or instagram
    return platforms[0] ? `gruene_jugend_${platforms[0]}` : 'gruene_jugend_instagram';
  }
  
  // Universal routes
  if (routePath.includes('claude_universal')) {
    const textForm = formData.textForm;
    if (textForm && typeof textForm === 'string') {
      // Clean and normalize the text form
      const cleanTextForm = textForm.toLowerCase().trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      
      // Map common text forms to specific types
      if (cleanTextForm.includes('antrag')) return 'antrag';
      if (cleanTextForm.includes('pressemitteilung')) return 'pressemitteilung';
      if (cleanTextForm.includes('rede')) return 'rede';
      if (cleanTextForm.includes('wahlprogramm')) return 'wahlprogramm';
      if (cleanTextForm.includes('instagram')) return 'instagram';
      if (cleanTextForm.includes('facebook')) return 'facebook';
      if (cleanTextForm.includes('twitter')) return 'twitter';
      
      // Return the cleaned form as is for other types
      return cleanTextForm;
    }
    return 'universal';
  }
  
  // Speech routes
  if (routePath.includes('claude_rede')) {
    return 'rede';
  }
  
  // Election program routes
  if (routePath.includes('claude_wahlprogramm')) {
    return 'wahlprogramm';
  }
  
  // Default fallback
  return 'universal';
}

/**
 * Generates a smart title based on content type and form data
 * @param {string} contentType - The content type
 * @param {Object} formData - The form data
 * @param {string} extractedTitle - Title extracted from content
 * @returns {string} Generated title
 */
function generateSmartTitle(contentType, formData = {}, extractedTitle = null) {
  // Use extracted title if available
  if (extractedTitle && extractedTitle.trim()) {
    return extractedTitle.trim();
  }
  
  // Generate title based on content type and form data
  const date = new Date().toLocaleDateString('de-DE');
  
  switch (contentType) {
    case 'antrag':
      return `Antrag: ${formData.idee || formData.thema || 'Unbenannt'}`;
    case 'kleine_anfrage':
      return `Kleine Anfrage: ${formData.idee || formData.thema || 'Unbenannt'}`;
    case 'grosse_anfrage':
      return `Große Anfrage: ${formData.idee || formData.thema || 'Unbenannt'}`;
    case 'pressemitteilung':
      return `Pressemitteilung: ${formData.thema || 'Unbenannt'}`;
    case 'rede':
      return `Rede: ${formData.thema || 'Unbenannt'}`;
    case 'wahlprogramm':
      return `Wahlprogramm-Kapitel: ${formData.thema || 'Unbenannt'}`;
    case 'instagram':
      return `Instagram-Post: ${formData.thema || 'Unbenannt'}`;
    case 'facebook':
      return `Facebook-Post: ${formData.thema || 'Unbenannt'}`;
    case 'twitter':
      return `Twitter-Post: ${formData.thema || 'Unbenannt'}`;
    case 'linkedin':
      return `LinkedIn-Post: ${formData.thema || 'Unbenannt'}`;
    case 'actionIdeas':
      return `Aktionsideen: ${formData.thema || 'Unbenannt'}`;
    case 'reelScript':
      return `Reel-Script: ${formData.thema || 'Unbenannt'}`;
    case 'universal':
      return `${formData.textForm || 'Text'}: ${formData.thema || 'Unbenannt'}`;
    default:
      if (contentType.startsWith('gruene_jugend_')) {
        const platform = contentType.replace('gruene_jugend_', '');
        return `Grüne Jugend ${platform}: ${formData.thema || 'Unbenannt'}`;
      }
      return `${contentType}: ${formData.thema || formData.idee || 'Unbenannt'}`;
  }
}

// Title generation instruction to append to user content
const TITLE_GENERATION_INSTRUCTION = `\n\nBeende mit: <GRUEN_TITLE>[Kurzer Titel]</GRUEN_TITLE>`;

/**
 * Extracts title from AI response content
 * @param {string} content - The AI response content
 * @param {string} contentType - The detected content type
 * @param {Object} formData - The original form data for fallback title generation
 * @returns {string} Extracted or generated title
 */
function extractTitleFromResponse(content, contentType, formData = {}) {
  if (!content || typeof content !== 'string') {
    return generateSmartTitle(contentType, formData);
  }

  console.log('[extractTitleFromResponse] Processing content length:', content.length);
  console.log('[extractTitleFromResponse] Content preview (last 200 chars):', content.substring(content.length - 200));

  // Multiple regex patterns to handle different title formats
  const titlePatterns = [
    // Primary: Custom XML-style markers
    /<GRUEN_TITLE>(.*?)<\/GRUEN_TITLE>/s,
    
    // Legacy HTML format: "<h2>Titel:</h2><p>Title Here</p>" (with possible whitespace)
    /<h[2-6]>Titel:<\/h[2-6]>\s*<p>(.+?)<\/p>/i,
    
    // Legacy HTML format: "<h2>Titel:</h2>\n\n<p>Title Here</p>" (with newlines)
    /<h[2-6]>Titel:<\/h[2-6]>\s*\n\s*<p>(.+?)<\/p>/i,
    
    // Legacy plain text format: "Titel: Title Here"
    /Titel:\s*(.+)$/im,
    
    // Alternative HTML format: "<p>Title Here</p>" as last paragraph after "Titel:"
    /Titel:<\/h[2-6]>\s*(?:\n\s*)*<p>(.+?)<\/p>/i,
    
    // Final fallback: Last <p> tag in content (might contain title)
    /<p>([^<]+)<\/p>\s*$/i
  ];
  
  for (let i = 0; i < titlePatterns.length; i++) {
    const pattern = titlePatterns[i];
    const titleMatch = content.match(pattern);
    
    console.log(`[extractTitleFromResponse] Trying pattern ${i + 1}:`, pattern.toString());
    
    if (titleMatch && titleMatch[1]) {
      let extractedTitle = titleMatch[1].trim();
      
      console.log(`[extractTitleFromResponse] Pattern ${i + 1} matched:`, extractedTitle);
      
      // Skip if extracted text contains HTML tags (except for pattern 1 which is our primary method)
      if (i > 0 && (extractedTitle.includes('<') || extractedTitle.includes('>'))) {
        console.log(`[extractTitleFromResponse] Skipping pattern ${i + 1} - contains HTML tags`);
        continue;
      }
      
      // Remove common punctuation at the end
      extractedTitle = extractedTitle.replace(/[.!?]+$/, '');
      
      // Truncate to reasonable length for UI
      if (extractedTitle.length > 60) {
        extractedTitle = extractedTitle.substring(0, 60).trim() + '...';
      }
      
      if (extractedTitle.length > 0) {
        console.log(`[extractTitleFromResponse] Successfully extracted title using pattern ${i + 1}:`, extractedTitle);
        return extractedTitle;
      }
    } else {
      console.log(`[extractTitleFromResponse] Pattern ${i + 1} did not match`);
    }
  }
  
  console.log('[extractTitleFromResponse] No title pattern matched, falling back to smart title generation');
  
  // Fallback to smart title generation
  return generateSmartTitle(contentType, formData);
}


/**
 * Processes AI response to extract title and enhance metadata
 * @param {Object} result - AI worker result object
 * @param {string} routePath - Route path for content type detection
 * @param {Object} formData - Original form data
 * @returns {Object} Enhanced result with title in metadata
 */
function processResponseWithTitle(result, routePath, formData = {}) {
  if (!result || !result.success || !result.content) {
    return result;
  }
  
  // Detect content type based on route and form data
  const contentType = detectContentType(routePath, formData);
  
  // Extract title from response
  const extractedTitle = extractTitleFromResponse(result.content, contentType, formData);
  
  // Clean content by removing title markers if they were extracted
  let cleanContent = result.content;
  
  // Remove GRUEN_TITLE markers if present
  const gruentitleMatch = result.content.match(/<GRUEN_TITLE>.*?<\/GRUEN_TITLE>/s);
  if (gruentitleMatch) {
    cleanContent = result.content.replace(/<GRUEN_TITLE>.*?<\/GRUEN_TITLE>/s, '').trim();
    console.log('[processResponseWithTitle] Removed GRUEN_TITLE markers from content');
  } else {
    // Fallback: Remove legacy title line if present
    const titleMatch = result.content.match(/Titel:\s*(.+)$/im);
    if (titleMatch) {
      cleanContent = result.content.replace(/\n*Titel:\s*(.+)$/im, '').trim();
      console.log('[processResponseWithTitle] Removed legacy title line from content');
    }
  }
  
  // Sanitize markdown for display in social/press contexts (avoid accidental code rendering)
  const SOCIAL_LIKE_TYPES = new Set(['instagram','facebook','twitter','linkedin','social','press','pressemitteilung','actionIdeas','reelScript']);
  if (SOCIAL_LIKE_TYPES.has(contentType)) {
    cleanContent = sanitizeMarkdownForDisplay(cleanContent);
  }

  // Platform-specific post-processing
  if (contentType === 'twitter') {
    // Collapse all line breaks to single spaces; trim excessive spaces
    cleanContent = cleanContent.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  return {
    ...result,
    content: cleanContent,
    metadata: {
      ...result.metadata,
      title: extractedTitle,
      contentType: contentType
    }
  };
}

/**
 * Sanitizes markdown to prevent entire responses being treated as code.
 * - Unwraps fenced code blocks (``` or ~~~) when they contain the bulk of the content
 * - Removes uniform 4-space indentation from most lines (classic code blocks)
 * This is safe for social/press content which should never be code.
 * @param {string} text
 * @returns {string}
 */
function sanitizeMarkdownForDisplay(text) {
  if (!text || typeof text !== 'string') return text;

  let out = text.trim();

  // 1) Unwrap full-width fenced block if the whole content is a single fence
  const fullFence = /^(?:```|~~~)([a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n(?:```|~~~)\s*$/;
  const m = out.match(fullFence);
  if (m) {
    out = m[2].trim();
  } else {
    // 2) If there is exactly one fenced block and very little text around it, unwrap it
    const fenceGlobal = /```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/g;
    const matches = [...out.matchAll(fenceGlobal)];
    if (matches.length === 1) {
      const inner = matches[0][1];
      const around = out.replace(matches[0][0], '').trim();
      if (around.length <= 40) {
        out = (around ? around + '\n\n' : '') + inner.trim();
      }
    }
  }

  // 3) If most non-empty lines begin with 4+ spaces, unindent once
  const lines = out.split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length >= 3) {
    const indented = nonEmpty.filter(l => /^\s{4,}/.test(l)).length;
    if (indented / nonEmpty.length >= 0.75) {
      out = lines.map(l => l.replace(/^\s{4}/, '')).join('\n').trim();
    }
  }

  return out;
}

// Attachment-aware system prompt enhancement
const ATTACHMENT_INSTRUCTIONS = `
Du hast Zugang zu beigefügten Dokumenten und Bildern. Nutze diese als Kontext und Referenz für deine Antwort:
- Analysiere den Inhalt der Dokumente sorgfältig
- Beziehe relevante Informationen in deine Erstellung mit ein
- Wenn du Inhalte aus den Dokumenten verwendest, weise darauf hin
- Die Dokumente dienen als Hintergrundinformation und Kontext für deine Aufgabe`;

/**
 * Enhances system prompt with attachment-aware instructions
 * @param {string} baseSystemPrompt - Original system prompt
 * @param {boolean} hasAttachments - Whether attachments are present
 * @returns {string} Enhanced system prompt
 */
const enhanceSystemPromptWithAttachments = (baseSystemPrompt, hasAttachments) => {
  if (!hasAttachments) {
    return baseSystemPrompt;
  }
  return baseSystemPrompt + ATTACHMENT_INSTRUCTIONS;
};

module.exports = {
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  MARKDOWN_CHAT_INSTRUCTIONS,
  MARKDOWN_FORMATTING_INSTRUCTIONS,
  COMPREHENSIVE_DOSSIER_INSTRUCTIONS,
  JSON_OUTPUT_FORMATTING_INSTRUCTIONS,
  SEARCH_DOCUMENTS_TOOL,
  PROVIDE_REFERENCES_TOOL,
  WEB_SEARCH_TOOL,
  TITLE_GENERATION_INSTRUCTION,
  ATTACHMENT_INSTRUCTIONS,
  extractCitationsFromText,
  processAIResponseWithCitations,
  isStructuredPrompt,
  formatUserContent,
  detectContentType,
  generateSmartTitle,
  extractTitleFromResponse,
  processResponseWithTitle,
  sanitizeMarkdownForDisplay,
  enhanceSystemPromptWithAttachments
};
