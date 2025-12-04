import { createAuthenticatedRouter } from '../utils/createAuthenticatedRouter.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('claude_alttext');


// Create authenticated router (same pattern as authCore.mjs and claude_social.js)
const router = createAuthenticatedRouter();

router.post('/', async (req, res) => {
  const { imageBase64, imageDescription, usePrivacyMode } = req.body;
  
  log.debug('[claude_alttext] Request received:', { 
    hasImageBase64: !!imageBase64,
    imageBase64Length: imageBase64?.length || 0,
    hasImageDescription: !!imageDescription,
    userId: req.user?.id || 'No user'
  });

  if (!imageBase64) {
    return res.status(400).json({ 
      error: 'Bild (imageBase64) ist erforderlich für die Alt-Text-Generierung'
    });
  }

  try {
    log.debug('[claude_alttext] Starting AI Worker request');

    // Build system prompt based on DBSV accessibility guidelines
    const systemPrompt = `Du erstellst Alternativtexte (Alt-Text) für Bilder basierend auf den Richtlinien des Deutschen Blinden- und Sehbehindertenverbands (DBSV). Alt-Text ist entscheidend, um Bilder für blinde und sehbehinderte Menschen zugänglich zu machen.

Befolge diese Richtlinien für effektiven Alt-Text:

1. Beginne mit den wichtigsten Informationen, die das Wesentliche des Bildes vermitteln (wie würdest du es jemandem am Telefon unter Zeitdruck beschreiben?)
2. Sei prägnant aber beschreibend, strebe 1-2 Sätze an
3. Verwende einfache, klare Sprache und vermeide Fachbegriffe oder Jargon
4. Beschreibe den Inhalt und die Funktion des Bildes, ohne zu interpretieren oder Meinungen zu äußern
5. Füge relevante Details hinzu, die für das Verständnis des Bildkontexts wesentlich sind
6. Vermeide Phrasen wie "Bild von" oder "Foto von", da Screenreader bereits anzeigen, dass es sich um ein Bild handelt
7. WICHTIG: Wenn Text im Bild sichtbar ist und für den Kontext relevant ist, gib den Text wörtlich wieder, ohne Anführungszeichen. Beispiel: "Plakat mit der Aufschrift Klimaschutz jetzt" statt "Plakat mit Text über Klimaschutz"

Struktur deinen Alt-Text in zwei Teilen:
- Pflicht: Kurz und knapp die nötigsten Infos im ersten Satz
- Kür: Genauere Beschreibung mit weniger wichtigen Details (falls nötig)

Gib deinen Alt-Text in <alt_text> Tags aus.`;

    // Build user content  
    let userContent = 'Analysiere dieses Bild und erstelle einen Alt-Text, der den DBSV-Richtlinien für Barrierefreiheit entspricht.';
    
    if (imageDescription) {
      userContent += `\n\nZusätzliche Bildbeschreibung vom Nutzer: ${imageDescription}`;
    }

    // Prepare AI Worker payload with image
    const payload = {
      systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64.replace(/^data:image\/[^;]+;base64,/, '') // Remove data URL prefix if present
            }
          },
          {
            type: 'text',
            text: userContent
          }
        ]
      }],
      options: {
        max_tokens: 2000,
        temperature: 0.3,
        useBedrock: true
      }
    };

    log.debug('[claude_alttext] Payload overview:', {
      systemPromptLength: systemPrompt.length,
      userContentLength: userContent.length,
      messageCount: payload.messages.length,
      userId: req.user?.id
    });

    // Process AI request
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'alttext',
      usePrivacyMode: usePrivacyMode || false,
      ...payload
    }, req);

    log.debug('[claude_alttext] AI Worker response received:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error,
      userId: req.user?.id
    });

    if (!result.success) {
      log.error('[claude_alttext] AI Worker error:', result.error);
      throw new Error(result.error);
    }

    // Extract alt text from response
    let altText = result.content;
    
    // Try to extract content from <alt_text> tags if present
    const altTextMatch = altText.match(/<alt_text>(.*?)<\/alt_text>/s);
    if (altTextMatch) {
      altText = altTextMatch[1].trim();
    }

    const response = { 
      altText: altText,
      metadata: result.metadata
    };
    
    log.debug('[claude_alttext] Sending successful response:', {
      altTextLength: response.altText?.length,
      hasMetadata: !!response.metadata,
      userId: req.user?.id
    });

    res.json(response);

  } catch (error) {
    log.error('[claude_alttext] Error creating alt text:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Alt-Texts',
      details: error.message 
    });
  }
});

export default router;