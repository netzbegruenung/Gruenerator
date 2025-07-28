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
} = require('../utils/promptUtils');

// Create authenticated router (same pattern as authCore.mjs and mem0.mjs)
const router = createAuthenticatedRouter();

router.post('/', async (req, res) => {
  const { thema, details, platforms = [], was, wie, zitatgeber, customPrompt } = req.body;
  
  // Current date for context
  const currentDate = new Date().toISOString().split('T')[0];
  
  console.log('[claude_social] Request received:', { 
    thema, 
    details, 
    platforms,
    hasCustomPrompt: !!customPrompt,
    customPromptLength: customPrompt?.length || 0,
    userId: req.user?.id || 'No user'
  });

  // Log custom prompt analysis for debugging
  if (customPrompt) {
    const isStructured = isStructuredPrompt(customPrompt);
    const hasInstructions = customPrompt.includes('Der User gibt dir folgende Anweisungen');
    const hasKnowledge = customPrompt.includes('Der User stellt dir folgendes, wichtiges Wissen');

    console.log('[claude_social] Custom prompt analysis:', {
      isStructured,
      hasInstructions,
      hasKnowledge,
      promptLength: customPrompt.length
    });
  }

  try {
    console.log('[claude_social] Starting AI Worker request');

    // Build system prompt
    let systemPrompt = `Du bist Social Media Manager für Bündnis 90/Die Grünen. Erstelle Vorschläge für Social-Media-Beiträge für die angegebenen Plattformen.

${HTML_FORMATTING_INSTRUCTIONS}`;

    // Add press release specific instructions if needed
    if (platforms.includes('pressemitteilung')) {
      systemPrompt += `

Für die Pressemitteilung agiere als Pressesprecher einer Gliederung von Bündnis 90/Die Grünen und schreibe eine Pressemitteilung für den Presseverteiler. Schreibe nur den Haupttext - der Abbinder wird manuell hinzugefügt.

Schreibe in folgendem Stil, Sprachstil und Tonfall:
- Der Text ist förmlich und sachlich und verwendet einen geradlinigen Berichtsstil.
- Es werden komplexe Sätze und eine Mischung aus zusammengesetzten und komplexen Satzstrukturen verwendet, was zu einem professionellen und informativen Ton beiträgt.
- Die Verwendung von spezifischen Begriffen und Namen verleiht dem Text einen autoritären Charakter.
- Der Text enthält auch direkte Zitate, die nahtlos eingefügt werden sollten, um den autoritativen und sachlichen Ton beizubehalten.

Achte bei der Umsetzung dieses Stils auf Klarheit, Präzision und eine ausgewogene Struktur deiner Sätze, um eine formale und objektive Darstellung der Informationen zu gewährleisten.`;
    }

    // Build user content based on custom prompt or standard format
    let userContent;
    
    // Build the specialized base content for social media generation
    const baseContent = `Erstelle einen maßgeschneiderten Social-Media-Beitrag für jede ausgewählte Plattform zu diesem Thema, der den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt. Berücksichtige diese plattformspezifischen Richtlinien:

${platforms.map(platform => {
  if (platform === 'pressemitteilung') return '';
  const upperPlatform = platform === 'reelScript' ? 'INSTAGRAM REEL' : platform.toUpperCase();
  const guidelines = PLATFORM_SPECIFIC_GUIDELINES[platform] || {};
  return `${upperPlatform}: Maximale Länge: ${guidelines.maxLength || 'N/A'} Zeichen. Stil: ${guidelines.style || 'N/A'} Fokus: ${guidelines.focus || 'N/A'} Zusätzliche Richtlinien: ${guidelines.additionalGuidelines || ''}`;
}).filter(Boolean).join('\n')}

${platforms.includes('pressemitteilung') ? '' : `Jeder Beitrag sollte:
1. Ein eigener Beitragstext angepasst an die spezifische Plattform und deren Zielgruppe sein.
2. Mit einer aufmerksamkeitsstarken Einleitung beginnen.
3. Wichtige Botschaften klar und prägnant vermitteln.
4. Emojis und Hashtags passend zur Plattform verwenden.
5. Themen wie Klimaschutz, soziale Gerechtigkeit und Vielfalt betonen.
6. Aktuelle Positionen der Grünen Partei einbeziehen.
7. Bei Bedarf auf weiterführende Informationen verweisen (z.B. Webseite).`}`;
    
    if (customPrompt) {
      const additionalInfo = `Zusätzliche Informationen (falls relevant):
- Thema: ${thema}
- Details: ${details}
- Plattformen: ${platforms.join(', ')}
${platforms.includes('pressemitteilung') ? `- Was: ${was || ''}
- Wie: ${wie || ''}
- Zitat von: ${zitatgeber || ''}` : ''}`;

      userContent = formatUserContent({
        customPrompt,
        baseContent,
        currentDate,
        additionalInfo
      });
    } else {
      // Standard content without custom prompt
      userContent = `Thema: ${thema}
Details: ${details}
Plattformen: ${platforms.join(', ')}
Aktuelles Datum: ${currentDate}
${platforms.includes('pressemitteilung') ? `
Was: ${was}
Wie: ${wie}
Zitat von: ${zitatgeber}` : ''}
        
${baseContent}`;
    }

    // Add title generation instruction to user content
    userContent += TITLE_GENERATION_INSTRUCTION;

    // Prepare AI Worker payload
    const payload = {
      systemPrompt,
      messages: [{
        role: 'user',
        content: userContent
      }],
      options: {
        max_tokens: 4000,
        temperature: 0.9
      }
    };

    console.log('[claude_social] Payload overview:', {
      systemPromptLength: systemPrompt.length,
      userContentLength: userContent.length,
      messageCount: payload.messages.length,
      userId: req.user?.id
    });

    // Process AI request
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'social',
      ...payload
    });

    console.log('[claude_social] AI Worker response received:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error,
      userId: req.user?.id
    });

    if (!result.success) {
      console.error('[claude_social] AI Worker error:', result.error);
      throw new Error(result.error);
    }

    // Prepare response with title processing
    const processedResult = processResponseWithTitle(result, '/claude_social', { thema, details, platforms, was, wie, zitatgeber });
    const response = { 
      content: processedResult.content,
      metadata: processedResult.metadata
    };
    
    console.log('[claude_social] Sending successful response:', {
      contentLength: response.content?.length,
      hasMetadata: !!response.metadata,
      userId: req.user?.id
    });

    res.json(response);

  } catch (error) {
    console.error('[claude_social] Error creating social media posts:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung der Social Media Posts',
      details: error.message 
    });
  }
});

export default router;