const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase Konfiguration
const supabaseUrl = process.env.VITE_YOU_SUPABASE_URL;
const supabaseKey = process.env.VITE_YOU_SUPABASE_ANON_KEY;

// Erstelle Supabase Client
const youSupabase = createClient(supabaseUrl, supabaseKey);

router.post('/', async (req, res) => {
  const { slug, formData } = req.body;
  
  try {
    console.log('[custom_generator] Anfrage erhalten:', { slug, formData });

    // Generator-Konfiguration aus Supabase abrufen
    const { data: generators, error: fetchError } = await youSupabase
      .from('custom_generators')
      .select('*')
      .eq('slug', slug)
      .limit(1);

    if (fetchError) throw fetchError;
    if (!generators || generators.length === 0) {
      return res.status(404).json({ error: 'Generator nicht gefunden' });
    }

    const generator = generators[0];
    
    // Platzhalter im Prompt mit den Formulardaten ersetzen
    let processedPrompt = generator.prompt;
    Object.entries(formData).forEach(([key, value]) => {
      processedPrompt = processedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    console.log('[custom_generator] Verarbeiteter Prompt:', processedPrompt);

    // KI-Anfrage über den AI Worker Pool
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'custom',
      systemPrompt: processedPrompt,
      messages: [{
        role: 'user',
        content: 'Bitte generiere den Text basierend auf den gegebenen Informationen.'
      }],
      options: {
        max_tokens: 4000,
        temperature: 0.7
      }
    });

    console.log('[custom_generator] AI Worker Antwort erhalten:', {
      success: result.success,
      contentLength: result.content?.length,
      error: result.error
    });

    if (!result.success) {
      console.error('[custom_generator] AI Worker Fehler:', result.error);
      throw new Error(result.error);
    }

    const response = { 
      content: result.content,
      metadata: result.metadata
    };

    console.log('[custom_generator] Sende erfolgreiche Antwort');
    res.json(response);

  } catch (error) {
    console.error('[custom_generator] Fehler bei der Textgenerierung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Textgenerierung',
      details: error.message 
    });
  }
});

module.exports = router; 