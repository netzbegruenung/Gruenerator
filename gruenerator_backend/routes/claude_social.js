import express from 'express';
import { createAuthenticatedRouter } from '../utils/createAuthenticatedRouter.js';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);

// Import prompt utilities
const {
  HTML_FORMATTING_INSTRUCTIONS,
  PLATFORM_SPECIFIC_GUIDELINES,
  isStructuredPrompt,
  formatUserContent,
  TITLE_GENERATION_INSTRUCTION,
  processResponseWithTitle
} = require('../utils/promptBuilderCompat');

// Import unified prompt building architecture
const { PromptBuilderWithExamples, addExamplesFromService } = require('../utils/promptBuilderCompat');

// Import attachment utilities
const {
  processAndBuildAttachments
} = require('../utils/attachmentUtils');

// Import response and error handling utilities
const { sendSuccessResponseWithAttachments } = require('../utils/responseFormatter');
const { withErrorHandler } = require('../utils/errorHandler');

// Import tool handler for web search continuation
const ToolHandler = require('../services/toolHandler');

// Import content examples service
import { contentExamplesService } from '../services/contentExamplesService.js';

// Create authenticated router (same pattern as authCore.mjs and mem0.mjs)
const router = createAuthenticatedRouter();

const routeHandler = withErrorHandler(async (req, res) => {
  const { thema, details, platforms = [], was, wie, zitatgeber, customPrompt, useWebSearchTool, usePrivacyMode, provider, attachments } = req.body;
  
  // Current date for context
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Process attachments using consolidated utility
  const attachmentResult = await processAndBuildAttachments(
    attachments, 
    usePrivacyMode, 
    'claude_social', 
    req.user?.id || 'unknown'
  );

  // Handle attachment errors
  if (attachmentResult.error) {
    return res.status(400).json({
      error: 'Fehler bei der Verarbeitung der Anhänge',
      details: attachmentResult.error
    });
  }

  console.log(`[claude_social] Request: ${thema} (${platforms.join(',')}) - User: ${req.user?.id} - WebSearch: ${useWebSearchTool ? 'ENABLED' : 'disabled'}`);

  // Log custom prompt analysis for debugging
  if (customPrompt) {
    const isStructured = isStructuredPrompt(customPrompt);
    const hasInstructions = customPrompt.includes('Der User gibt dir folgende Anweisungen');
    const hasKnowledge = customPrompt.includes('Der User stellt dir folgendes, wichtiges Wissen');

    // Custom prompt debug info removed for cleaner logs
  }

  console.log('[claude_social] Processing social media generation');
    
    const builder = new PromptBuilderWithExamples('social')
      .enableDebug(process.env.NODE_ENV === 'development')
      .configureExamples({
        maxExamples: 3,
        maxCharactersPerExample: 400,
        includeSimilarityInfo: true,
        formatStyle: 'structured'
      });

    // Set system role
    let systemRole = 'Du bist Social Media Manager für Bündnis 90/Die Grünen. Erstelle Vorschläge für Social-Media-Beiträge für die angegebenen Plattformen.\n\nWICHTIG: Gib NUR die fertigen Social-Media-Posts aus. Keine Erklärungen, keine Zwischenschritte, keine zusätzlichen Kommentare. Nur die Posts selbst.';
    
    // Add press release specific role modification
    if (platforms.includes('pressemitteilung')) {
      systemRole += `\n\nFür die Pressemitteilung agiere als Pressesprecher einer Gliederung von Bündnis 90/Die Grünen und schreibe eine Pressemitteilung für den Presseverteiler. Schreibe nur den Haupttext - der Abbinder wird manuell hinzugefügt.

Schreibe in folgendem Stil, Sprachstil und Tonfall:
- Der Text ist förmlich und sachlich und verwendet einen geradlinigen Berichtsstil.
- Es werden komplexe Sätze und eine Mischung aus zusammengesetzten und komplexen Satzstrukturen verwendet, was zu einem professionellen und informativen Ton beiträgt.
- Die Verwendung von spezifischen Begriffen und Namen verleiht dem Text einen autoritären Charakter.
- Der Text enthält auch direkte Zitate, die nahtlos eingefügt werden sollten, um den autoritativen und sachlichen Ton beizubehalten.

Achte bei der Umsetzung dieses Stils auf Klarheit, Präzision und eine ausgewogene Struktur deiner Sätze, um eine formale und objektive Darstellung der Informationen zu gewährleisten.`;
    }
    
    builder.setSystemRole(systemRole);
    
    // Set formatting instructions
    builder.setFormatting(HTML_FORMATTING_INSTRUCTIONS);
    
    // Set platform constraints (PROTECTED - cannot be overridden by documents)
    builder.setConstraints(platforms);

    // Enable web search if requested
    if (useWebSearchTool) {
      const searchQuery = `${thema} ${details || ''} Bündnis 90 Die Grünen Politik`;
      console.log(`[claude_social] 🔍 Web search enabled for: "${searchQuery}"`);
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

    // Build request content
    const requestData = {
      thema,
      details,
      platforms
    };
    
    // Add press-specific data if relevant
    if (platforms.includes('pressemitteilung')) {
      if (was) requestData.was = was;
      if (wie) requestData.wie = wie;
      if (zitatgeber) requestData.zitatgeber = zitatgeber;
    }

    // Build the request content
    let requestContent;
    
    if (customPrompt) {
      // For custom prompts, provide structured data
      requestContent = requestData;
    } else {
      // For standard requests, build descriptive content
      requestContent = `Erstelle einen maßgeschneiderten Social-Media-Beitrag für jede ausgewählte Plattform zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Berücksichtige diese plattformspezifischen Richtlinien:

${platforms.map(platform => {
  if (platform === 'pressemitteilung') return '';
  const upperPlatform = platform === 'reelScript' ? 'INSTAGRAM REEL' : platform.toUpperCase();
  const guidelines = PLATFORM_SPECIFIC_GUIDELINES[platform] || {};
  return `${upperPlatform}: Stil: ${guidelines.style || 'N/A'} Fokus: ${guidelines.focus || 'N/A'} Zusätzliche Richtlinien: ${guidelines.additionalGuidelines || ''}`;
}).filter(Boolean).join('\n')}

${platforms.includes('pressemitteilung') ? '' : `Inhaltliche Fokuspunkte:
- Themen wie Klimaschutz, soziale Gerechtigkeit und Vielfalt betonen
- Aktuelle Positionen der Grünen Partei einbeziehen
- Emojis und Hashtags passend zur Plattform verwenden
- Bei Bedarf auf weiterführende Informationen verweisen`}

Aktuelles Datum: ${currentDate}

Bitte erstelle die Inhalte für folgende Angaben:
Thema: ${thema}
Details: ${details}
Plattformen: ${platforms.join(', ')}
${platforms.includes('pressemitteilung') && was ? `Was: ${was}` : ''}
${platforms.includes('pressemitteilung') && wie ? `Wie: ${wie}` : ''}
${platforms.includes('pressemitteilung') && zitatgeber ? `Zitat von: ${zitatgeber}` : ''}

${TITLE_GENERATION_INSTRUCTION}`;
    }

    builder.setRequest(requestContent);

    // Fetch and add relevant examples for supported platforms
    const supportedPlatformsForExamples = ['instagram', 'facebook', 'twitter'];
    const relevantPlatforms = platforms.filter(p => supportedPlatformsForExamples.includes(p));
    
    if (relevantPlatforms.length > 0) {
      // Fetching examples for platforms (logging removed)
      
      // Create search query from theme and details
      const searchQuery = `${thema} ${details || ''}`.trim();
      
      // Fetch examples for each relevant platform and add to builder
      for (const platform of relevantPlatforms) {
        await addExamplesFromService(builder, platform, searchQuery, {
          limit: 3,
          useCache: true,
          formatStyle: 'structured'
        }, req, 'press/social', platforms);
      }
    } else {
    }

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
        temperature: 0.9,
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
        console.log(`[claude_social] 🔍 Web search ENABLED - Tool: ${tools[0].name} (${tools[0].max_uses} max uses)`);
      } else {
        console.log(`[claude_social] 🔍 Web search results pre-fetched and added to context`);
      }
    }

    // Process AI request
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'social',
      usePrivacyMode: usePrivacyMode || false,
      ...payload
    }, req);

    // AI Worker response logging simplified

    if (!result.success) {
      console.error('[claude_social] AI Worker error:', result.error);
      throw new Error(result.error);
    }

    // Handle tool_use responses (e.g., web search) - continue conversation
    if (result.stop_reason === 'tool_use') {
      console.log('[claude_social] Received tool_use response, continuing conversation with ToolHandler');
      
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
        
        console.log('[claude_social] Tool continuation successful, sending final result');
        
        // Send the final result
        sendSuccessResponseWithAttachments(
          res,
          finalResult,
          '/claude_social',
          { thema, details, platforms, was, wie, zitatgeber },
          attachmentResult,
          usePrivacyMode,
          provider
        );
        return;
        
      } catch (toolError) {
        console.error('[claude_social] Tool continuation failed:', toolError);
        
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
          '/claude_social',
          { thema, details, platforms, was, wie, zitatgeber },
          attachmentResult,
          usePrivacyMode,
          provider
        );
        return;
      }
    }

    // Validate that we have actual content for non-tool responses
    if (!result.content || (typeof result.content !== 'string' && !result.content.length)) {
      console.error('[claude_social] Empty content in AI Worker result:', result);
      throw new Error('Keine Inhalte von der KI erhalten');
    }

    // Send standardized success response
    sendSuccessResponseWithAttachments(
      res,
      result,
      '/claude_social',
      { thema, details, platforms, was, wie, zitatgeber },
      attachmentResult,
      usePrivacyMode,
      provider
    );
}, '/claude_social');

router.post('/', routeHandler);

export default router;