const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js'); // Assuming Supabase might be needed later for slug checks, etc.
const { HTML_FORMATTING_INSTRUCTIONS } = require('../utils/promptUtils'); // Include if needed for prompt formatting

// Helper function to generate the sanitized name (similar to frontend)
const generateSanitizedName = (label) => {
  if (!label) return '';
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

// Helper function to sanitize slug (similar to frontend)
const sanitizeSlug = (slug) => {
    if (!slug) return '';
    return slug
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

router.post('/', async (req, res) => {
  const { description, useBackupProvider } = req.body;

  if (!description || typeof description !== 'string' || description.trim() === '') {
    return res.status(400).json({ error: 'Beschreibung darf nicht leer sein.' });
  }

  try {
    const systemPrompt = `Du bist ein Assistent, der dabei hilft, Konfigurationen für einen benutzerdefinierten Textgenerator zu erstellen.
Basierend auf der Beschreibung des Benutzers sollst du eine JSON-Struktur generieren, die Folgendes enthält:
1.  \`name\`: Ein kurzer, aussagekräftiger Name für den Generator (string).
2.  \`slug\`: Ein URL-freundlicher Bezeichner (nur Kleinbuchstaben, Zahlen, Bindestriche) (string).
3.  \`fields\`: Ein Array von Formularfeld-Objekten (max. 5). Jedes Objekt muss enthalten:
    *   \`label\`: Der Text, der dem Benutzer im Formular angezeigt wird (string).
    *   \`name\`: Ein technischer Name (nur Kleinbuchstaben, Zahlen, Unterstriche), automatisch vom Label abgeleitet (string).
    *   \`type\`: Entweder 'text' (für kurze Eingaben) oder 'textarea' (für längere Eingaben) (string). Wähle basierend auf dem Label sinnvoll aus.
    *   \`required\`: Ob das Feld ausgefüllt werden muss (boolean). Leite ab, ob das Feld essenziell erscheint.
    *   \`placeholder\`: Optionaler Hilfetext im Feld (string).
4.  \`prompt\`: Die Kernanweisung für die spätere KI-Generierung, die die vom Benutzer ausgefüllten Felder verwenden wird. Formuliere einen klaren Auftrag. Verwende KEINE Platzhalter wie {{feldname}} im Prompt selbst, die werden später automatisch hinzugefügt. (string).

Gib deine Antwort ausschließlich als valides JSON-Objekt zurück, ohne zusätzliche Erklärungen oder Formatierungen davor oder danach.
Stelle sicher, dass der 'slug' nur Kleinbuchstaben, Zahlen und Bindestriche enthält.
Stelle sicher, dass der 'name' jedes Feldes korrekt vom 'label' abgeleitet wird (Kleinbuchstaben, Unterstriche statt Leerzeichen, keine Sonderzeichen).
Limitiere die Anzahl der Felder auf maximal 5.

Beispiel für ein Feld-Objekt:
{ "label": "Thema des Artikels", "name": "thema_des_artikels", "type": "text", "required": true, "placeholder": "z.B. Klimawandel" }
`;

    const userContent = `Erstelle eine Generator-Konfiguration für folgende Beschreibung:
${description}
`;

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'generator_config', // Use a specific type
      systemPrompt,
      messages: [{ role: "user", content: userContent }],
      options: {
        max_tokens: 2000, // Adjust as needed
        temperature: 0.5, // Moderate temperature for structured output
        // IMPORTANT: Request JSON output if the model supports it directly
        // For OpenAI (used as backup or primary):
      },
      useBackupProvider: useBackupProvider || false // Default to primary provider
    });

    if (!result.success) {
      throw new Error(result.error || 'AI worker failed to generate configuration.');
    }

    let config;
    try {
      config = JSON.parse(result.content);
      console.log('[generator_configurator] Parsed AI Response:', config);
    } catch (parseError) {
      console.error('[generator_configurator] Failed to parse AI response as JSON:', result.content);
      throw new Error('Die KI hat keine gültige JSON-Konfiguration zurückgegeben.');
    }

    // Validate and sanitize the received configuration
    if (!config || typeof config !== 'object') {
        throw new Error('Ungültige Konfigurationsstruktur von der KI empfangen.');
    }
    if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
        throw new Error('Name fehlt oder ist ungültig.');
    }
     if (!config.slug || typeof config.slug !== 'string' || config.slug.trim() === '') {
        throw new Error('Slug fehlt oder ist ungültig.');
    }
     if (!config.prompt || typeof config.prompt !== 'string' || config.prompt.trim() === '') {
        throw new Error('Prompt fehlt oder ist ungültig.');
    }
    if (!Array.isArray(config.fields)) {
        throw new Error('Felder fehlen oder sind kein Array.');
    }
     if (config.fields.length > 5) {
        console.warn('[generator_configurator] AI generated more than 5 fields, trimming.');
        config.fields = config.fields.slice(0, 5);
    }

    // Sanitize slug and fields
    config.slug = sanitizeSlug(config.slug);
    config.fields = config.fields.map(field => {
        if (!field || typeof field !== 'object' || !field.label || typeof field.label !== 'string') {
             console.warn('[generator_configurator] Invalid field object received from AI, skipping:', field);
             return null; // Mark invalid fields
        }
        const sanitizedName = generateSanitizedName(field.label);
        return {
            label: field.label.trim(),
            name: sanitizedName, // Ensure name is derived correctly
            type: (field.type === 'textarea' || field.type === 'text') ? field.type : 'text', // Default to 'text' if invalid
            required: typeof field.required === 'boolean' ? field.required : false, // Default to false
            placeholder: (field.placeholder && typeof field.placeholder === 'string') ? field.placeholder.trim() : '' // Optional placeholder
        };
    }).filter(field => field !== null); // Remove invalid fields

    // Final check after sanitization
     if (config.fields.some(f => !f.name)) {
        throw new Error('Ein Feld konnte keinen technischen Namen generieren.');
     }
     const fieldNames = config.fields.map(f => f.name);
     const nameSet = new Set(fieldNames);
     if (nameSet.size !== fieldNames.length) {
       // Attempt simple deduplication (e.g., add _1, _2) - could be enhanced
       const counts = {};
       config.fields = config.fields.map(f => {
           counts[f.name] = (counts[f.name] || 0) + 1;
           if (counts[f.name] > 1) {
               f.name = `${f.name}_${counts[f.name] - 1}`;
           }
           return f;
       });
     }
     

    console.log('[generator_configurator] Sending sanitized config to frontend:', config);
    res.json(config);

  } catch (error) {
    console.error('[generator_configurator] Fehler bei der Konfigurationserstellung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung der Generator-Konfiguration.',
      details: error.message 
    });
  }
});

module.exports = router;