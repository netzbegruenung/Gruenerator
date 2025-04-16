const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { HTML_FORMATTING_INSTRUCTIONS } = require('../utils/promptUtils.js');

// Supabase Konfiguration
const supabaseUrl = process.env.VITE_YOU_SUPABASE_URL;
const supabaseKey = process.env.VITE_YOU_SUPABASE_ANON_KEY;

// Erstelle Supabase Client
let youSupabase;
if (supabaseUrl && supabaseKey) {
  try {
    youSupabase = createClient(supabaseUrl, supabaseKey);
    console.log('[custom_generator] Supabase client initialized successfully.'); // Optional: Add success log
  } catch (error) {
    console.error(`[custom_generator] Failed to initialize Supabase client: ${error.message}. Invalid URL provided?`, { supabaseUrlProvided: supabaseUrl });
    youSupabase = null; // Ensure youSupabase is null if initialization fails
  }
} else {
  console.error("[custom_generator] Supabase URL or Key is missing. Custom generator functionality will be disabled.");
  // youSupabase is already undefined/null here, so no change needed
}

router.post('/', async (req, res) => {
  const { slug, formData } = req.body;
  
  // Check if Supabase client is initialized
  if (!youSupabase) {
    console.error('[custom_generator] Supabase client not initialized.');
    return res.status(503).json({ error: 'Custom generator service is currently unavailable due to configuration issues.' });
  }

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

    // Append HTML formatting instructions
    processedPrompt += `\n\n${HTML_FORMATTING_INSTRUCTIONS}`;

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