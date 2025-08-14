const express = require('express');
const router = express.Router();
// Import unified prompt building architecture
const { 
  HTML_FORMATTING_INSTRUCTIONS,
  TITLE_GENERATION_INSTRUCTION,
  processResponseWithTitle,
  PromptBuilder
} = require('../../utils/promptBuilderCompat');

const {
  processAndBuildAttachments
} = require('../../utils/attachmentUtils');

// Import response and error handling utilities
const { createSuccessResponseWithAttachments } = require('../../utils/responseFormatter');
const { withErrorHandler, handleValidationError } = require('../../utils/errorHandler');
const { processBundestagDocuments } = require('../../utils/bundestagUtils');

// Web search tool now centralized in PromptBuilder

/**
 * Vereinfachter Endpunkt zum Generieren eines Antrags mit optionaler Websuche
 */
const routeHandler = withErrorHandler(async (req, res) => {
  // Extract useWebSearchTool along with other flags
  const { requestType, idee, details, gliederung, useBedrock, customPrompt, useWebSearchTool, useBundestagApi, selectedBundestagDocuments, usePrivacyMode, provider, attachments } = req.body;
  
  // Aktuelles Datum ermitteln
  const currentDate = new Date().toISOString().split('T')[0];

  // Validiere die Eingabedaten
  if (!customPrompt && !idee) {
    return handleValidationError(
      res,
      '/antraege/antrag_simple',
      'Idee oder ein benutzerdefinierter Prompt ist erforderlich'
    );
  }

  // Process attachments using consolidated utility
  const attachmentResult = await processAndBuildAttachments(
    attachments, 
    usePrivacyMode, 
    'antrag_simple', 
    req.user?.id || 'unknown'
  );

  // Handle attachment errors
  if (attachmentResult.error) {
    return handleValidationError(res, '/antraege/antrag_simple', attachmentResult.error);
  }

  // Logging der Anfrage
  console.log('Einfache Antrag-Anfrage erhalten:', {
    requestType: requestType || 'antrag',
    idee: idee?.substring(0, 50) + (idee?.length > 50 ? '...' : ''),
    hasCustomPrompt: !!customPrompt,
    useBedrock: useBedrock,
    useWebSearchTool: useWebSearchTool,
    useBundestagApi: useBundestagApi,
    usePrivacyMode: usePrivacyMode,
    provider: provider || 'default',
    hasAttachments: attachmentResult.hasAttachments,
    attachmentsCount: attachmentResult.summary?.count || 0,
    attachmentsTotalSizeMB: attachmentResult.summary?.totalSizeMB || 0
  });

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
      (useBundestagApi && bundestagDocuments ? ` mit ${bundestagDocuments.totalResults} parlamentarischen Dokumenten` : '') +
      (attachmentResult.hasAttachments ? ` mit ${attachmentResult.summary.count} Anhängen (${attachmentResult.summary.totalSizeMB}MB)` : ''));
    
    // Build prompt using new Context-First Architecture
    console.log('[antrag_simple] Building prompt with new Context-First Architecture');
    
    const builder = new PromptBuilder('antrag')
      .enableDebug(process.env.NODE_ENV === 'development');

    // Build system role based on request type
    let systemRole = 'Du bist ein erfahrener Kommunalpolitiker von Bündnis 90/Die Grünen. ';
    
    // Add request type specific instructions
    if (requestType === 'kleine_anfrage') {
      systemRole += 'Erstelle eine KLEINE ANFRAGE nach kommunalrechtlichen Standards. ';
      systemRole += 'Kleine Anfragen dienen der präzisen Fachinformation, sind schriftlich und punktuell. ';
      systemRole += 'Verwende folgenden Aufbau: 1) Betreff (max. 120 Zeichen), 2) Kurze Begründung (3-4 Sätze mit Rechtsgrundlage), 3) Nummerierte präzise Fragen (max. 3-5 Hauptfragen), 4) Erbetene Antwortform und Frist. ';
      systemRole += 'Formuliere neutral und sachlich ohne Wertungen. ';
    } else if (requestType === 'grosse_anfrage') {
      systemRole += 'Erstelle eine GROSSE ANFRAGE nach kommunalrechtlichen Standards. ';
      systemRole += 'Große Anfragen behandeln politisch bedeutsame Gesamtthemen umfassend mit höherer Öffentlichkeitswirkung. ';
      systemRole += 'Verwende folgenden Aufbau: 1) Betreff (aussagekräftig), 2) Ausführliche Begründung mit politischem Kontext, 3) Nummerierte Fragen-Cluster (Hauptfragen mit Unterfragen), 4) Bitte um schriftliche UND mündliche Behandlung im Rat. ';
      systemRole += 'Die Anfrage soll das Thema umfassend beleuchten und eine Debatte im Rat ermöglichen. ';
    } else {
      systemRole += 'Entwirf einen kommunalpolitischen ANTRAG basierend auf der gegebenen Idee. ';
      systemRole += 'Der Antrag muss folgende Struktur haben: 1) Betreff, 2) Antragstext mit konkreten Beschlussvorschlägen, 3) Ausführliche Begründung. ';
    }
    
    // Add parliamentary documents instructions if available
    if (useBundestagApi && bundestagDocuments && bundestagDocuments.totalResults > 0) {
      systemRole += 'Du hast Zugang zu relevanten parlamentarischen Dokumenten (Drucksachen und Plenarprotokolle) aus dem Bundestag. Nutze diese Informationen, um den Antrag zu fundieren und auf bereits diskutierte oder beschlossene Themen zu verweisen. Zitiere spezifische Dokumente mit ihrer Nummer und dem Datum. ';
    }
    
    systemRole += 'WICHTIG: Gib nur den finalen deutschen Text aus, keine englischen Zwischenschritte oder Gedankengänge. Beginne direkt mit dem fertigen Dokument.';

    builder
      .setSystemRole(systemRole)
      .setFormatting(HTML_FORMATTING_INSTRUCTIONS);
    
    // Note: Antrag generation doesn't use platform constraints (flexible lengths based on document type)
    
    // Enable web search if requested
    if (useWebSearchTool) {
      const searchQuery = `${idee} ${details || ''} Bündnis 90 Die Grünen Politik`;
      console.log(`[antrag_simple] 🔍 Web search enabled for: "${searchQuery}"`);
      await builder.handleWebSearch(searchQuery, 'content');
    }
    
    // Add documents if present (both attachments and parliamentary documents)
    if (attachmentResult.documents.length > 0) {
      await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
    }

    // Add parliamentary documents as knowledge if available
    const { formatDocumentsForPrompt } = require('../../utils/bundestagUtils');
    if (useBundestagApi && bundestagDocuments && bundestagDocuments.totalResults > 0) {
      const parlamentaryDocsText = formatDocumentsForPrompt(bundestagDocuments);
      builder.addKnowledge([parlamentaryDocsText]);
    }

    // Handle custom instructions with structure detection
    if (customPrompt) {
      // Prüfe ob es sich um strukturierte Anweisungen/Wissen handelt
      const isStructured = customPrompt.includes('Der User gibt dir folgende Anweisungen') || 
                          customPrompt.includes('Der User stellt dir folgendes, wichtiges Wissen');
      
      if (isStructured) {
        // Structured prompts are passed directly as instructions
        builder.setInstructions(customPrompt);
      } else {
        // Legacy custom prompts are wrapped
        builder.setInstructions(`Benutzerdefinierter Prompt: ${customPrompt}`);
      }
    }

    // Build the request content
    let requestContent;
    const requestTypeText = requestType === 'kleine_anfrage' ? 'eine kleine Anfrage' : 
                           requestType === 'grosse_anfrage' ? 'eine große Anfrage' : 
                           'einen kommunalpolitischen Antrag';

    if (customPrompt) {
      // For custom prompts, provide structured data
      requestContent = {
        requestType: requestTypeText,
        idee: idee || 'Nicht angegeben',
        details: details || '',
        gliederung: gliederung || '',
        currentDate
      };
    } else {
      // For standard requests, build descriptive content
      requestContent = `Erstelle ${requestTypeText} zum Thema: ${idee}` + 
                      (details ? `\n\nDetails: ${details}` : '') + 
                      (gliederung ? `\n\nFür die Gliederung: ${gliederung}` : '') +
                      `\n\nAktuelles Datum: ${currentDate}` +
                      `\n\nWICHTIG: Antworte ausschließlich auf Deutsch. Gib nur das finale Dokument aus, keine Zwischenschritte oder Erklärungen.` +
                      `\n\n${TITLE_GENERATION_INSTRUCTION}`;
    }

    builder.setRequest(requestContent);

    // Build the final prompt
    const promptResult = builder.build();
    const systemPrompt = promptResult.system;
    const messages = promptResult.messages;
    const tools = promptResult.tools;
    
    // Extract web search sources for frontend display (separate from Claude prompt)
    const webSearchSources = builder.getWebSearchSources();
    
    // Log web search status
    if (useWebSearchTool) {
      if (tools.length > 0) {
        console.log(`[antrag_simple] 🔍 Web search ENABLED - Tool: ${tools[0].name}`);
      } else {
        console.log(`[antrag_simple] 🔍 Web search results pre-fetched and added to context`);
      }
    }
    
    // Simple debug logging for prompt visualization
    console.log('\n📄 [ANTRAG DEBUG] New Context-First Architecture:');
    console.log('System:', systemPrompt.substring(0, 200) + '...');
    console.log('Messages Count:', messages.length);
    console.log('Tools Count:', tools.length);
    console.log('Has Attachments:', attachmentResult.hasAttachments);
    console.log('Has Parliamentary Docs:', !!(useBundestagApi && bundestagDocuments && bundestagDocuments.totalResults > 0));
    console.log('Web Search Enabled:', useWebSearchTool);
    console.log('─'.repeat(50));
    
    // Prepare payload for AI Worker
    const payload = {
      systemPrompt,
      messages,
      tools,
      options: {
        temperature: 0.3,
        max_tokens: 8000, // Ensure sufficient tokens for complete document generation
        useBedrock: useBedrock,
        // Add provider selection for privacy mode
        ...(usePrivacyMode && provider && { provider: provider })
      },
      metadata: {
        webSearchSources: webSearchSources.length > 0 ? webSearchSources : null
      }
    };
    
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antrag',
      ...payload
    }, req);

    if (!result.success) {
      console.error('Fehler bei Claude-Anfrage:', result.error);
      throw new Error(result.error);
    }
    
    // Create response with special antrag metadata
    const specialMetadata = {
      webSearchUsed: useWebSearchTool || false,
      bundestagApiUsed: useBundestagApi || false,
      bundestagDocumentsUsed: bundestagDocuments ? bundestagDocuments.totalResults : 0
    };

    const response = createSuccessResponseWithAttachments(
      result,
      '/antraege/antrag_simple',
      { requestType, idee, details, gliederung },
      attachmentResult,
      usePrivacyMode,
      provider
    );

    // Add special metadata
    response.metadata = {
      ...response.metadata,
      ...specialMetadata
    };
    
    console.log(`[antrag_simple] Success: ${response.content?.length || 0} chars generated`);
    res.json(response);
}, '/antraege/antrag_simple');

router.post('/', routeHandler);

module.exports = router; 