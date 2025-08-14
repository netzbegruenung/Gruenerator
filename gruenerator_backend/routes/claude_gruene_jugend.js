const express = require('express');
const router = express.Router();
// Import unified prompt building architecture
const {
  HTML_FORMATTING_INSTRUCTIONS,
  isStructuredPrompt,
  formatUserContent,
  TITLE_GENERATION_INSTRUCTION,
  processResponseWithTitle,
  PromptBuilder
} = require('../utils/promptBuilderCompat');

// Import attachment utilities
const {
  processAndBuildAttachments
} = require('../utils/attachmentUtils');

// Import response and error handling utilities
const { sendSuccessResponseWithAttachments } = require('../utils/responseFormatter');
const { withErrorHandler } = require('../utils/errorHandler');

const platformGuidelines = {
  instagram: {
    maxLength: 1000,
    style: "Radikal, aktivistisch und direkt.",
    focus: "Politische Bildung und Aktivismus.",
    additionalGuidelines: `
      - Gezielte Verwendung von Emojis (✊ für Aktivismus, ❗️ für wichtige Punkte)
      - Kurze, prägnante Absätze
      - Hashtags strategisch einsetzen (#GrueneJugend #Klimagerechtigkeit)
    `
  },
  twitter: {
    maxLength: 280,
    style: "Scharf, konfrontativ und pointiert.",
    focus: "Schnelle Reaktionen und Kritik.",
    additionalGuidelines: `
      - Maximal 1-2 Emojis pro Tweet
      - Mit Ironie und Sarkasmus arbeiten
      - Hashtags für Reichweite nutzen
      - Direkte Kritik an politischen Gegner*innen
    `
  },
  tiktok: {
    maxLength: 150,
    style: "Jung, rebellisch und authentisch.",
    focus: "Politische Bildung für junge Menschen.",
    additionalGuidelines: `
      - Komplexe Themen einfach erklären
      - Trends kreativ politisch nutzen
      - Humor einsetzen
      - Authentizität betonen
    `
  },
  messenger: {
    maxLength: 2000,
    style: "Informativ und mobilisierend.",
    focus: "Aktivismus-Koordination.",
    additionalGuidelines: `
      - Ausführliche politische Analysen
      - Konkrete Handlungsvorschläge
      - Infos zu Demos und Aktionen
      - Links zu Ressourcen
      - Emojis nur für wichtige Markierungen
    `
  },
  reelScript: {
    maxLength: 1000,
    style: "Aktivistisch und authentisch.",
    focus: "Video-Content für politische Bildung.",
    additionalGuidelines: `
      - 60 Sekunden Sprechzeit
      - Struktur:
        * Hook (10s): Provokante Frage/Statement
        * Hauptteil (40s): Politische Analyse
        * Call-to-Action (10s): Handlungsaufforderung
      - [Szenenanweisungen] für authentische Darstellung
    `
  },
  actionIdeas: {
    maxLength: 1000,
    style: "Konkret und aktivierend.",
    focus: "Direkte Aktionen und Protest.",
    additionalGuidelines: `
      - 2-3 konkrete Aktionsvorschläge
      - Kreative Protestformen
      - Materialanforderungen
      - Zeitaufwand
      - Rechtliche Hinweise
      - ✊ für Aktionsaufrufe
    `
  }
};

const routeHandler = withErrorHandler(async (req, res) => {
  const { thema, details, platforms = [], customPrompt, useWebSearchTool, usePrivacyMode, provider, attachments } = req.body;
  
  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Process attachments using consolidated utility
  const attachmentResult = await processAndBuildAttachments(
    attachments, 
    usePrivacyMode, 
    'claude_gruene_jugend', 
    req.user?.id || 'unknown'
  );

  // Handle attachment errors
  if (attachmentResult.error) {
    return res.status(400).json({
      error: 'Fehler bei der Verarbeitung der Anhänge',
      details: attachmentResult.error
    });
  }

  console.log('[claude_gruene_jugend] Anfrage erhalten:', { 
    thema, 
    details, 
    platforms,
    hasCustomPrompt: !!customPrompt,
    useWebSearchTool: useWebSearchTool || false,
    usePrivacyMode: usePrivacyMode || false,
    provider: usePrivacyMode && provider ? provider : 'default',
    hasAttachments: attachmentResult.hasAttachments,
    attachmentsCount: attachmentResult.summary?.count || 0,
    attachmentsTotalSizeMB: attachmentResult.summary?.totalSizeMB || 0
  });
    console.log('[claude_gruene_jugend] Starte AI Worker Request');

    // Build prompt using new Context-First Architecture
    console.log('[claude_gruene_jugend] Building prompt with new Context-First Architecture');
    
    const builder = new PromptBuilder('gruene_jugend')
      .enableDebug(process.env.NODE_ENV === 'development');

    // Set system role with Grüne Jugend specific style
    const systemRole = `Du bist Social Media Manager für die GRÜNE JUGEND. 
Erstelle Vorschläge für Social-Media-Beiträge im typischen Stil der GRÜNEN JUGEND.

Allgemeine Richtlinien für alle Plattformen:
- Klare linke politische Positionierung
- Direkte, jugendliche Ansprache ("Leute", "ihr", "wir")
- Klare Handlungsaufforderungen ("Kommt vorbei!", "Seid dabei!")
- Solidarische Botschaften mit marginalisierten Gruppen
- Fragen zur Interaktion stellen ("Bist du dabei?", "Was würdet ihr tun?")
- Aufruf zu direktem Aktivismus

Formatiere deine Antwort als Text mit Überschriften für die verschiedenen Plattformen. 
WICHTIG: Jede Plattform muss mit einem eigenen Header in Großbuchstaben und einem Doppelpunkt 
beginnen, z.B. "TWITTER:" oder "INSTAGRAM:"`;
    
    builder
      .setSystemRole(systemRole)
      .setFormatting(HTML_FORMATTING_INSTRUCTIONS)
      .setConstraints(platforms); // Automatic platform constraints using PLATFORM_SPECIFIC_GUIDELINES

    // Enable web search if requested
    if (useWebSearchTool) {
      const searchQuery = `${thema} ${details || ''} Bündnis 90 Die Grünen Politik`;
      console.log(`[claude_gruene_jugend] 🔍 Web search enabled for: "${searchQuery}"`);
      await builder.handleWebSearch(searchQuery, 'content');
    }

    // Add documents if present
    if (attachmentResult.documents.length > 0) {
      await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
    }

    // Add custom instructions if present
    if (customPrompt) {
      builder.setInstructions(customPrompt);
    }

    // Build the request content
    let requestContent;
    
    if (customPrompt) {
      // For custom prompts, provide structured data
      requestContent = {
        thema,
        details,
        platforms
      };
    } else {
      // For standard requests, build descriptive content
      requestContent = `Erstelle einen maßgeschneiderten Social-Media-Beitrag für jede ausgewählte Plattform zu diesem Thema im charakteristischen Stil der GRÜNEN JUGEND. Berücksichtige diese plattformspezifischen Richtlinien:

${platforms.map(platform => {
  const guidelines = platformGuidelines[platform];
  return `${platform.toUpperCase()}: Maximale Länge: ${guidelines.maxLength} Zeichen. Stil: ${guidelines.style} Fokus: ${guidelines.focus} Zusätzliche Richtlinien: ${guidelines.additionalGuidelines}`;
}).join('\n')}

Jeder Beitrag sollte:
1. Eine klare linke, aktivistische Perspektive zeigen
2. Direkte Kritik an Missständen üben
3. Konkrete Handlungsaufforderungen enthalten
4. Solidarität mit marginalisierten Gruppen ausdrücken
5. Emojis effektiv zur Betonung wichtiger Punkte einsetzen
6. Hashtags strategisch verwenden
7. Eine jugendliche, authentische Sprache nutzen
8. Zum direkten politischen Handeln aufrufen

Aktuelles Datum: ${currentDate}

Bitte erstelle die Inhalte für folgende Angaben:
Thema: ${thema}
Details: ${details}
Plattformen: ${platforms.join(', ')}

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

    const payload = {
      systemPrompt,
      messages,
      tools,
      options: {
        max_tokens: 8000,
        temperature: 0.9,
        ...(usePrivacyMode && provider && { provider: provider })
      },
      metadata: {
        webSearchSources: webSearchSources.length > 0 ? webSearchSources : null
      }
    };

    // Log web search status
    if (useWebSearchTool) {
      if (tools.length > 0) {
        console.log(`[claude_gruene_jugend] 🔍 Web search ENABLED - Tool: ${tools[0].name}`);
      } else {
        console.log(`[claude_gruene_jugend] 🔍 Web search results pre-fetched and added to context`);
      }
    }
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'gruene_jugend',
      ...payload
    }, req);

    console.log('[claude_gruene_jugend] AI Worker Antwort erhalten:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[claude_gruene_jugend] AI Worker Fehler:', result.error);
      throw new Error(result.error);
    }

    // Send standardized success response
    sendSuccessResponseWithAttachments(
      res,
      result,
      '/claude_gruene_jugend',
      { thema, details, platforms },
      attachmentResult,
      usePrivacyMode,
      provider
    );
}, '/claude_gruene_jugend');

router.post('/', routeHandler);

module.exports = router; 