import express from 'express';
import { createAuthenticatedRouter } from '../utils/createAuthenticatedRouter.js';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);

// Import prompt utilities
const {
  HTML_FORMATTING_INSTRUCTIONS,
  isStructuredPrompt,
  TITLE_GENERATION_INSTRUCTION,
  processResponseWithTitle
} = require('../utils/promptBuilderCompat');

// Import unified prompt building architecture
const { PromptBuilder } = require('../utils/promptBuilderCompat');

// Import attachment utilities
const {
  processAndBuildAttachments
} = require('../utils/attachmentUtils');

// Import response and error handling utilities
const { sendSuccessResponseWithAttachments } = require('../utils/responseFormatter');
const { withErrorHandler } = require('../utils/errorHandler');

// Import tool handler for web search continuation
const ToolHandler = require('../services/toolHandler');

// Create authenticated router (same pattern as authCore.mjs and claude_social.js)
const router = createAuthenticatedRouter();

const routeHandler = withErrorHandler(async (req, res) => {
  const { originalText, targetLanguage = 'Deutsch', customPrompt, useWebSearchTool, usePrivacyMode, provider, attachments } = req.body;
  
  // Current date for context
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Process attachments using consolidated utility
  const attachmentResult = await processAndBuildAttachments(
    attachments, 
    usePrivacyMode, 
    'leichte_sprache', 
    req.user?.id || 'unknown'
  );

  // Handle attachment errors
  if (attachmentResult.error) {
    return res.status(400).json({
      error: 'Fehler bei der Verarbeitung der Anhänge',
      details: attachmentResult.error
    });
  }

  console.log(`[leichte_sprache] Request: ${originalText?.substring(0, 100) || 'no text'}... - User: ${req.user?.id} - WebSearch: ${useWebSearchTool ? 'ENABLED' : 'disabled'}`);

  // Log custom prompt analysis for debugging
  if (customPrompt) {
    const isStructured = isStructuredPrompt(customPrompt);
    const hasInstructions = customPrompt.includes('Der User gibt dir folgende Anweisungen');
    const hasKnowledge = customPrompt.includes('Der User stellt dir folgendes, wichtiges Wissen');

    // Custom prompt debug info removed for cleaner logs
  }

  console.log('[leichte_sprache] Processing Leichte Sprache translation');
    
  const builder = new PromptBuilder('leichte_sprache')
    .enableDebug(process.env.NODE_ENV === 'development');

  // Set system role for Leichte Sprache translation
  let systemRole = `Du bist ein Experte für Leichte Sprache. Deine Aufgabe ist es, Texte in Leichte Sprache zu übersetzen. Leichte Sprache ist eine vereinfachte Form des Deutschen für Menschen mit kognitiven Beeinträchtigungen, Lernschwierigkeiten oder begrenzten Sprachkenntnissen.

WICHTIG: Gib NUR den übersetzten Text in Leichte Sprache aus. Keine Erklärungen, keine Zwischenschritte, keine zusätzlichen Kommentare. Nur die Übersetzung selbst.

Befolge strikt die Regeln der Leichten Sprache nach dem Netzwerk Leichte Sprache e.V. (Neuauflage 2022):

WORT-REGELN:
- Verwende einfache, alltägliche Wörter ("genehmigen" → "erlauben")
- Erkläre schwere Wörter sofort in einfachen Worten ("Der Fraktions·vorstand ist ein Chef·team")
- Sei konsistent - verwende dasselbe Wort für dieselbe Sache
- Bevorzuge kurze Wörter, trenne Komposita mit Mediopunkt (·): "Bundes·tag", "Politiker·innen", "Klima·schutz", "Arbeits·plätze"
- Vermeide Abkürzungen außer sehr bekannten (WC, LKW, Dr., ICE)
- Verwende Verben und aktive Sprache
- Vermeide Genitiv ("das Haus vom Lehrer" statt "des Lehrers")
- Vermeide Konjunktiv ("vielleicht regnet es" statt "es könnte regnen")
- Bevorzuge positive Formulierungen
- Vermeide Redewendungen und bildliche Sprache

ZAHLEN UND DATEN:
- Verwende arabische Zahlen, keine römischen
- Datum: "3. März 2012" oder "3.3.2012"
- Uhrzeiten: "11:00 Uhr", "18:00 Uhr"
- Telefonnummern mit Leerzeichen: "0 55 44 – 33 22 11"
- Große Zahlen vereinfachen ("viele Menschen" statt "14.795")

SATZ-REGELN (ULTRA-WICHTIG - ZÄHLE JEDES WORT!):
- NIEMALS mehr als 6 Wörter pro Satz
- Idealerweise nur 4-5 Wörter pro Satz
- ZÄHLE die Wörter in jedem Satz bevor du ihn schreibst!
- Strikt eine Idee pro Satz - niemals mehr!
- Einfachste Wort-Reihenfolge: Wer? Was macht die Person?
- Nur Hauptsätze, keine Nebensätze
- VERBOTEN: Sätze mit "und", "aber", "weil" in der Mitte
- Du darfst neue Sätze mit "Und", "Oder", "Aber" beginnen
- Spreche den Leser direkt an ("Sie", "Wir")

PROFESSIONELLER STIL - ORIENTIERE DICH DARAN:
"Verschiedene Politiker·innen sind in einer Fraktion. Sie sind sehr viele. Deswegen wählen sie Anführer·innen. Sie sind wie Kapitäne der Fraktion."
(Jeder Satz hat nur 4-6 Wörter!)

SATZ-LÄNGEN-BEISPIELE:
Schlecht: "Wir wollen die erste klima·neutrale Wirtschaft der Welt haben." (10 Wörter - viel zu lang!)
Gut: "Wir wollen die Ersten sein. Unsere Wirtschaft wird klima·neutral." (je 5 und 4 Wörter)

Schlecht: "Deutschland wird so noch attraktiver für Investoren." (8 Wörter - zu lang!)
Gut: "Deutschland wird attraktiver. Investoren kommen gern." (je 3 und 3 Wörter)

Schlecht: "Unsere Firmen bleiben stark und es gibt gute Jobs." (9 Wörter + 2 Gedanken!)
Gut: "Unsere Firmen bleiben stark. Es gibt gute Jobs." (je 4 und 4 Wörter)

BEISPIELE FÜR PERFEKTE LEICHTE SPRACHE:
Schlecht: "Die Politiker arbeiten zusammen in einer Fraktion, weil sie die gleichen Ziele haben."
Gut: "Verschiedene Politiker·innen sind in einer Fraktion. Sie haben die gleichen Ziele."

Schlecht: "Der Klimaschutz und die Wirtschaftspolitik müssen miteinander vereinbart werden."
Gut: "Klima·schutz ist wichtig. Die Wirtschaft ist auch wichtig. Beides gehört zusammen."

ERKLÄRUNGS-REGEL:
Erkläre JEDES zusammengesetzte Wort sofort. Erkläre auch englische Wörter. Frage dich: Versteht das ein 10-jähriges Kind?
AUCH ERKLÄRUNGEN müssen kurz sein - maximal 6 Wörter!

Beispiele:
- "Standort·vorteil bedeutet: Deutschland ist gut für Firmen." (8 Wörter - zu lang!)
- Besser: "Standort·vorteil ist unser Vorteil. Deutschland ist gut für Firmen." (je 4 und 6 Wörter)

- "Sozial·ökologische Markt·wirtschaft bedeutet: Wirtschaft für Menschen und Umwelt." (9 Wörter - viel zu lang!)
- Besser: "Sozial·ökologische Markt·wirtschaft ist unser Ziel. Das bedeutet: Wirtschaft für Menschen. Und Wirtschaft für die Umwelt." (je 6, 4, 5 Wörter)

- "CO2" → "CO2 sind schädliche Gase"
- "Wasser·stoff ist ein sauberer Brenn·stoff" → "Wasser·stoff macht saubere Energie"
- "Heraus·forderungen" → verwende lieber "Probleme"

ÜBERSCHRIFTEN-REGEL:
Mache Überschriften so einfach wie möglich:
- "Erneuer·bare Energien helfen allen" → "Saubere Energie"  
- "Sozial·ökologische Markt·wirtschaft" → "Neue Wirtschaft"
- Maximal 3 Wörter in Überschriften

QUALITÄTS-KONTROLLE:
Prüfe jeden Satz: Hat er mehr als 6 Wörter? Dann teile ihn auf!
Hat er 2 Gedanken? Dann mache 2 Sätze daraus!
Sind die Erklärungen auch kurz genug?

LAYOUT (für deinen Text):
- Ein sehr kurzer Satz pro Zeile
- Überschriften ohne Doppelpunkt am Ende
- Kurze Absätze mit klaren Überschriften
- Aufzählungszeichen "•" für Listen
- Linksbündig, keine Blocksatz
- Viel Weißraum zwischen Abschnitten

MEDIOPUNKT-REGEL:
Verwende IMMER den Mediopunkt (·) für zusammengesetzte Wörter, niemals Bindestrich (-):
- Richtig: "Bundes·tag", "Fraktions·vorstand", "Politiker·innen", "Arbeits·plätze"
- Falsch: "Bundes-tag", "Fraktions-vorstand", "Politiker-innen", "Arbeits-plätze"`;
    
  builder.setSystemRole(systemRole);
    
  // Set formatting instructions
  builder.setFormatting(HTML_FORMATTING_INSTRUCTIONS);
    
  // Enable web search if requested
  if (useWebSearchTool) {
    const searchQuery = `Leichte Sprache Regeln Netzwerk ${originalText?.substring(0, 50) || ''}`;
    console.log(`[leichte_sprache] 🔍 Web search enabled for: "${searchQuery}"`);
    await builder.handleWebSearch(searchQuery, 'content', req.app.locals.aiWorkerPool);
  }

  // Add documents if present
  if (attachmentResult.documents.length > 0) {
    await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
  }

  // Add custom instructions if present
  if (customPrompt) {
    builder.setInstructions(customPrompt);
  }

  // Build request content
  let requestContent;
    
  if (customPrompt) {
    // For custom prompts, provide structured data
    requestContent = {
      originalText,
      targetLanguage,
      currentDate
    };
  } else {
    // For standard requests, build descriptive content
    requestContent = `Übersetze den folgenden Text in Leichte Sprache.

Befolge dabei strikt alle Regeln der Leichten Sprache.
Achte besonders auf:
- Einfache, alltägliche Wörter
- Kurze, klare Sätze (ein Gedanke pro Satz)
- Aktive Sprache
- Direkte Ansprache ("Sie")
- Positive Formulierungen
- Erklärung schwieriger Begriffe

Originaltext:
${originalText}

Zielsprache: ${targetLanguage}

Aktuelles Datum: ${currentDate}

${TITLE_GENERATION_INSTRUCTION}`;
  }

  builder.setRequest(requestContent);

  // Build the final prompt
  const promptResult = builder.build();
  const systemPrompt = promptResult.system;
  const messages = promptResult.messages;
  const tools = promptResult.tools;
    
  // Extract web search sources for frontend display (separate from Claude prompt)
  const webSearchSources = builder.getWebSearchSources();

  // Prepare AI Worker payload
  const payload = {
    systemPrompt,
    messages,
    options: {
      temperature: 0.3, // Lower temperature for more consistent translation
      ...(tools.length > 0 && { tools }),
      ...(usePrivacyMode && provider && { provider: provider })
    },
    metadata: {
      webSearchSources: webSearchSources.length > 0 ? webSearchSources : null
    }
  };

  // Log web search status
  if (useWebSearchTool) {
    if (tools.length > 0) {
      console.log(`[leichte_sprache] 🔍 Web search ENABLED - Tool: ${tools[0].name} (${tools[0].max_uses} max uses)`);
    } else {
      console.log(`[leichte_sprache] 🔍 Web search results pre-fetched and added to context`);
    }
  }

  // Process AI request
  const result = await req.app.locals.aiWorkerPool.processRequest({
    type: 'leichte_sprache',
    usePrivacyMode: usePrivacyMode || false,
    ...payload
  }, req);

  // AI Worker response logging simplified

  if (!result.success) {
    console.error('[leichte_sprache] AI Worker error:', result.error);
    throw new Error(result.error);
  }

  // Handle tool_use responses (e.g., web search) - continue conversation
  if (result.stop_reason === 'tool_use') {
    console.log('[leichte_sprache] Received tool_use response, continuing conversation with ToolHandler');
      
    try {
      // Continue conversation using ToolHandler
      const finalResult = await ToolHandler.continueWithToolUse(
        req.app.locals.aiWorkerPool,
        result,
        systemPrompt,
        messages,
        payload.options,
        req
      );
        
      console.log('[leichte_sprache] Tool continuation successful, sending final result');
        
      // Send the final result
      sendSuccessResponseWithAttachments(
        res,
        finalResult,
        '/leichte_sprache',
        { originalText, targetLanguage },
        attachmentResult,
        usePrivacyMode,
        provider
      );
      return;
        
    } catch (toolError) {
      console.error('[leichte_sprache] Tool continuation failed:', toolError);
        
      // Fallback to informative message if tool continuation fails
      const toolErrorMessage = {
        content: 'Die Websuche konnte nicht abgeschlossen werden. Bitte versuchen Sie es ohne Websuche oder versuchen Sie es später erneut.',
        metadata: {
          toolCallsDetected: true,
          stopReason: result.stop_reason,
          toolCalls: result.tool_calls || [],
          continuationError: toolError.message
        }
      };
        
      sendSuccessResponseWithAttachments(
        res,
        toolErrorMessage,
        '/leichte_sprache',
        { originalText, targetLanguage },
        attachmentResult,
        usePrivacyMode,
        provider
      );
      return;
    }
  }

  // Validate that we have actual content for non-tool responses
  if (!result.content || (typeof result.content !== 'string' && !result.content.length)) {
    console.error('[leichte_sprache] Empty content in AI Worker result:', result);
    throw new Error('Keine Inhalte von der KI erhalten');
  }

  // Send standardized success response
  sendSuccessResponseWithAttachments(
    res,
    result,
    '/leichte_sprache',
    { originalText, targetLanguage },
    attachmentResult,
    usePrivacyMode,
    provider
  );
}, '/leichte_sprache');

router.post('/', routeHandler);

export default router;