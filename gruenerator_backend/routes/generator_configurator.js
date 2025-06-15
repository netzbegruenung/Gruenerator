const express = require('express');
const router = express.Router();

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
  const { description } = req.body;

  if (!description || typeof description !== 'string' || description.trim() === '') {
    return res.status(400).json({ error: 'Beschreibung darf nicht leer sein.' });
  }

  try {
    // Simplified system prompt
    const systemPrompt = `Du bist ein Assistent, der JSON-Konfigurationen für Textgeneratoren erstellt.`;

    // Detailed instructions moved to the user message
    const userContent = `Erstelle eine Generator-Konfiguration für folgende Beschreibung:
\"${description}\"

Deine Antwort muss ausschließlich ein valides JSON-Objekt sein, ohne Erklärungen davor oder danach. Das JSON-Objekt muss folgende Schlüssel enthalten:
1.  \`name\`: Ein kurzer, aussagekräftiger Name für den Generator (string).
2.  \`slug\`: Ein URL-freundlicher Bezeichner (nur Kleinbuchstaben, Zahlen, Bindestriche) (string).
3.  \`fields\`: Ein Array von Formularfeld-Objekten (maximal 5). Jedes Feld-Objekt muss enthalten:
    *   \`label\`: Der sichtbare Feldname (string).
    *   \`name\`: Technischer Name (Kleinbuchstaben, Zahlen, Unterstriche), vom Label abgeleitet (string).
    *   \`type\`: 'text' oder 'textarea' (string).
    *   \`required\`: true oder false (boolean).
    *   \`placeholder\`: Optionaler Hilfetext (string).
    *   Beispiel: { "label": "Thema", "name": "thema", "type": "text", "required": true, "placeholder": "z.B. Klimawandel" }
4.  \`prompt\`: Die Kernanweisung für die spätere KI-Generierung. Formuliere einen klaren Auftrag. Die Platzhalter für die Felder (z.B. {{thema}}) werden später hinzugefügt, nenne sie hier NICHT. (string).
5.  \`title\`: Ein ansprechender Titel für die Generator-Webseite (string).
6.  \`description\`: Eine kurze Erklärung (1-2 Sätze), was der Generator tut (string).

Beachte:
*   Der 'slug' darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.
*   Der 'name' jedes Feldes muss korrekt vom 'label' abgeleitet werden (Kleinbuchstaben, Unterstriche statt Leerzeichen, keine Sonderzeichen).
*   Maximal 5 Felder definieren.
`;

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'generator_config', // Use a specific type
      systemPrompt, // Use the new short system prompt
      messages: [{ role: "user", content: userContent }], // Use the new detailed user content
      options: {
        temperature: 0.5, // Moderate temperature for structured output
      },

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
    if (!config.title || typeof config.title !== 'string' || config.title.trim() === '') {
        console.warn('[generator_configurator] Title missing or invalid from AI, using Name as fallback.');
        config.title = config.name; // Use name as fallback title
    }
    if (!config.description || typeof config.description !== 'string' || config.description.trim() === '') {
        console.warn('[generator_configurator] Description missing or invalid from AI, providing a default.');
        config.description = `Ein Generator für: ${config.name}`; // Provide a generic description
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