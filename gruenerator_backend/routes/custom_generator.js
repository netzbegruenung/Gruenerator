const express = require('express');
const router = express.Router();
const { HTML_FORMATTING_INSTRUCTIONS } = require('../utils/promptUtils.js');
const { supabaseService } = require('../utils/supabaseClient');

router.post('/', async (req, res) => {
  const { slug, formData } = req.body;
  
  // Check if the correct supabaseService client is initialized
  if (!supabaseService) {
    console.error('[custom_generator] Supabase service client not initialized.');
    return res.status(503).json({ error: 'Custom generator service is currently unavailable due to configuration issues with the service client.' });
  }

  try {
    console.log('[custom_generator] Anfrage erhalten:', { slug, formData });

    // Use supabaseService to fetch generator configuration
    const { data: generators, error: fetchError } = await supabaseService
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

// GET Route zum Abrufen aller benutzerdefinierten Generatoren
router.get('/', async (req, res) => {
  try {
    // Prüfe, ob der Client initialisiert ist
    if (!supabaseService) {
      return res.status(500).json({ error: 'Supabase client not initialized. Check backend environment variables.' });
    }

    // Verwende den Anon-Client zum Abrufen der Daten
    const { data: generators, error: fetchError } = await supabaseService
      .from('custom_generators')
      .select('id, name, slug, title, description'); // Wähle nur benötigte Felder

    if (fetchError) {
      console.error('Error fetching custom generators:', fetchError);
      return res.status(500).json({ error: fetchError.message });
    }

    res.json(generators);
  } catch (error) {
    console.error('Unexpected error fetching custom generators:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

module.exports = router; 