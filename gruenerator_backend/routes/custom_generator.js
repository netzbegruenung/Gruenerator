const express = require('express');
const router = express.Router();
const { HTML_FORMATTING_INSTRUCTIONS } = require('../utils/promptUtils.js');
const { supabaseService } = require('../utils/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');

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

// Neue Route zur Überprüfung der Slug-Verfügbarkeit
router.get('/check-slug/:slug', async (req, res) => {
  const { slug } = req.params;

  if (!supabaseService) {
    console.error('[custom_generator_check_slug] Supabase service client not initialized.');
    return res.status(503).json({ error: 'Service is currently unavailable.' });
  }

  if (!slug || slug.trim() === '') {
    return res.status(400).json({ error: 'Slug darf nicht leer sein.' });
  }

  try {
    const { data, error } = await supabaseService
      .from('custom_generators')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle(); // maybeSingle() ist gut, da es null zurückgibt, wenn nichts gefunden wird, anstatt eines Fehlers

    if (error) {
      console.error('[custom_generator_check_slug] Error fetching slug from Supabase:', error);
      return res.status(500).json({ error: 'Fehler bei der Überprüfung des Slugs.' });
    }

    res.json({ exists: !!data }); // Gibt true zurück, wenn data ein Objekt ist (also existiert), sonst false

  } catch (error) {
    console.error('[custom_generator_check_slug] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' });
  }
});

// DELETE Route zum Löschen eines benutzerdefinierten Generators
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    // Supabase client check is good
    if (!supabaseService) {
      console.error('[custom_generator_delete] Supabase service client not initialized.');
      return res.status(500).json({ error: 'Custom generator service is currently unavailable.' });
    }

    // Prüfe zuerst, ob der Generator existiert und dem User gehört
    const { data: generator, error: fetchError } = await supabaseService
      .from('custom_generators')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[custom_generator_delete] Error fetching generator for ownership check:', fetchError);
      if (fetchError.code === 'PGRST116') { // PGRST116: Searched for a single row, but found no rows
        return res.status(404).json({ error: 'Generator nicht gefunden.' });
      }
      // anderer Supabase Fehler beim Holen der Daten
      return res.status(500).json({ error: 'Fehler beim Überprüfen des Generators: ' + fetchError.message });
    }

    // Da .single() bei Nicht-Existenz einen Fehler wirft (PGRST116), ist ein expliziter `if (!generator)` Check hier
    // eigentlich nicht mehr nötig, wenn fetchError.code === 'PGRST116' oben behandelt wird.
    // Ein zusätzlicher Check schadet aber nicht, falls sich das Verhalten von .single() ändert oder `null` zurückgibt ohne Fehler.
    if (!generator) {
        console.warn('[custom_generator_delete] Generator object was null after fetch without PGRST116 error, responding 404.');
        return res.status(404).json({ error: 'Generator nicht gefunden (unexpected state).' });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_delete] User ${userId} attempted to delete generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Löschen dieses Generators.' });
    }

    // Lösche den Generator
    const { error: deleteError } = await supabaseService
      .from('custom_generators')
      .delete()
      .eq('id', id)
      .eq('user_id', userId); // Stellt sicher, dass der User nur eigene löscht

    if (deleteError) {
      console.error('[custom_generator_delete] Error deleting custom generator from Supabase:', deleteError);
      return res.status(500).json({ error: 'Fehler beim Löschen des Generators: ' + deleteError.message });
    }

    console.log(`[custom_generator_delete] Generator ${id} successfully deleted by user ${userId}`);
    res.status(204).send();

  } catch (error) {
    console.error('[custom_generator_delete] Unexpected error during delete operation:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

module.exports = router; 