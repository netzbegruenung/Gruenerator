const express = require('express');
const router = express.Router();

router.post('/generate-social', async (req, res) => {
  const { subtitles } = req.body;
  console.log('[subtitlerSocial] Anfrage erhalten:', { subtitlesLength: subtitles?.length });

  try {
    console.log('[subtitlerSocial] Starte AI Worker Request');
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'subtitler_social',
      systemPrompt: 'Du bist Social Media Manager für Bündnis 90/Die Grünen. Erstelle einen Instagram Reel Beitragstext basierend auf den Untertiteln des Videos. Der Text soll die Kernbotschaft des Videos aufgreifen und in einen ansprechenden Social Media Post umwandeln.',
      messages: [{
        role: 'user',
        content: `
        Untertitel: ${subtitles}
        
        Erstelle einen Instagram Reel Beitragstext, der:
        1. Mit einem starken Hook beginnt
        2. Die Kernbotschaft des Videos prägnant zusammenfasst
        3. Maximal 2-3 relevante Hashtags verwendet
        4. Mit einem Call-to-Action endet
        5. Emojis passend aber sparsam einsetzt
        6. Maximal 300 Zeichen lang ist
        7. Den Stil und die Werte von Bündnis 90/Die Grünen widerspiegelt`
      }],
      options: {
        max_tokens: 1000,
        temperature: 0.7
      }
    });

    console.log('[subtitlerSocial] AI Worker Antwort erhalten:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[subtitlerSocial] AI Worker Fehler:', result.error);
      throw new Error(result.error);
    }

    res.json({ 
      content: result.content,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('[subtitlerSocial] Fehler bei der Social Media Text Erstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung des Social Media Texts',
      details: error.message 
    });
  }
});

module.exports = router; 