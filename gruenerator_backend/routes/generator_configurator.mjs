import express from 'express';

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
    const systemPrompt = `Du bist ein Assistent, der JSON-Konfigurationen für Grüneatoren erstellt. Verwende niemals das Wort "Generator", sondern immer "Grünerator".`;

    // Enhanced user message with explicit JSON format requirements
    const userContent = `Erstelle eine Grünerator-Konfiguration für folgende Beschreibung:
\"${description}\"

WICHTIG - ANTWORTFORMAT:
Antworte NUR mit dem JSON-Objekt. Verwende KEINE Markdown-Formatierung, KEINE Codeblöcke (\`\`\`), KEINE Erklärungen.
Beginne deine Antwort direkt mit { und ende mit }. Nichts davor, nichts danach.

FALSCH: \`\`\`json {...} \`\`\`
RICHTIG: {"name": "...", "slug": "..."}

Das JSON-Objekt muss folgende Schlüssel enthalten:
1.  \`name\`: Ein kurzer, aussagekräftiger Name für den Grünerator (string).
2.  \`slug\`: Ein URL-freundlicher Bezeichner (nur Kleinbuchstaben, Zahlen, Bindestriche) (string).
3.  \`fields\`: Ein Array von Formularfeld-Objekten (maximal 5). Jedes Feld-Objekt muss enthalten:
    *   \`label\`: Der sichtbare Feldname (string).
    *   \`name\`: Technischer Name (Kleinbuchstaben, Zahlen, Unterstriche), vom Label abgeleitet (string).
    *   \`type\`: 'text', 'textarea' oder 'select' (string).
    *   \`required\`: true oder false (boolean).
    *   \`placeholder\`: Optionaler Hilfetext (string).
    *   \`options\`: Wenn type='select', ein Array von Optionen mit {label: "Anzeige", value: "wert"} (array, nur bei select erforderlich).
    *   Beispiel Text/Textarea: { "label": "Thema", "name": "thema", "type": "text", "required": true, "placeholder": "z.B. Klimawandel" }
    *   Beispiel Select: { "label": "Kategorie", "name": "kategorie", "type": "select", "required": true, "placeholder": "Bitte wählen...", "options": [{"label": "Politik", "value": "politik"}, {"label": "Umwelt", "value": "umwelt"}] }
4.  \`prompt\`: Die Kernanweisung für die spätere KI-Generierung. Formuliere einen klaren Auftrag. Die Platzhalter für die Felder (z.B. {{thema}}) werden später hinzugefügt, nenne sie hier NICHT. (string).
5.  \`title\`: Ein ansprechender Titel für die Grünerator-Webseite (string).
6.  \`description\`: Eine kurze Erklärung (1-2 Sätze), was der Grünerator tut (string).

Beachte:
*   Der 'slug' darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.
*   Der 'name' jedes Feldes muss korrekt vom 'label' abgeleitet werden (Kleinbuchstaben, Unterstriche statt Leerzeichen, keine Sonderzeichen).
*   Maximal 5 Felder definieren.
*   Antworte ausschließlich mit dem JSON-Objekt, keine Markdown-Formatierung!
`;

    // Robust JSON parsing: handle accidental code fences, prose, or stray characters
    const extractJsonObject = (raw) => {
      if (raw == null) return null;
      let text = String(raw).trim();
      // Remove common Markdown code fences
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      // Remove leading/trailing quotes if the whole payload was quoted
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }
      // Replace smart quotes with normal quotes
      text = text.replace(/[""]/g, '"').replace(/['']/g, "'");
      // Find first { and last } to slice out the JSON object if wrapped in prose
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
      }
      // Log a short parse attempt preview
      try {
        console.log('[generator_configurator] Parsing JSON preview:', {
          startsWithCurly: text.trim().startsWith('{'),
          endsWithCurly: text.trim().endsWith('}'),
          length: text.length
        });
      } catch {}

      // Helper: escape bare newlines inside JSON string literals
      const escapeBareNewlinesInStrings = (input) => {
        let out = '';
        let inString = false;
        let escape = false;
        for (let i = 0; i < input.length; i++) {
          const ch = input[i];
          if (inString) {
            if (!escape && ch === '"') {
              inString = false;
              out += ch;
              continue;
            }
            if (ch === '\n') { out += '\\n'; escape = false; continue; }
            if (ch === '\r') { out += '\\r'; escape = false; continue; }
            if (ch === '\t') { out += '\\t'; escape = false; continue; }
            out += ch;
            // track escapes
            if (ch === '\\' && !escape) {
              escape = true;
            } else {
              // any non-backslash resets escape
              escape = false;
            }
          } else {
            out += ch;
            if (ch === '"' && !escape) {
              inString = true;
            }
            // outside strings, no need to track escape
            escape = (ch === '\\') ? !escape : false;
          }
        }
        return out;
      };
      // Try parse
      try {
        return JSON.parse(text);
      } catch (e) {
        // Second attempt: escape bare newlines in string literals and retry
        const repaired = escapeBareNewlinesInStrings(text);
        try {
          return JSON.parse(repaired);
        } catch (e2) {
          // Enhanced logging to locate failure
          const msg = String(e2.message || '');
          const m = msg.match(/position\s+(\d+)/i);
          const pos = m ? parseInt(m[1], 10) : -1;
          if (pos >= 0) {
            const start = Math.max(0, pos - 60);
            const end = Math.min(repaired.length, pos + 60);
            console.error('[generator_configurator] JSON parse error around position', pos, 'context:', repaired.slice(start, end));
          } else {
            console.error('[generator_configurator] JSON parse error:', msg);
          }
          return null;
        }
      }
    };

    // Helper to request a config from AI with an optional provider override
    const requestConfigFromAI = async (providerOverride = null) => {
      const requestPayload = {
        type: 'generator_config',
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        options: {
          temperature: 0.1 // lower temp for stricter JSON
        }
      };
      if (providerOverride) {
        requestPayload.provider = providerOverride;
      }
      const result = await req.app.locals.aiWorkerPool.processRequest(requestPayload);
      if (!result.success) {
        throw new Error(result.error || 'AI worker failed to generate configuration.');
      }
      try {
        console.log('[generator_configurator] AI provider/meta:', {
          provider: result?.metadata?.provider,
          model: result?.metadata?.model,
          contentLength: result?.content?.length,
          providerOverride
        });
      } catch {}
      return result.content;
    };

    // Attempt up to 3 times with default provider (Mistral), then fallback once to AWS Bedrock
    let rawContent = null;
    let parsed = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !parsed) {
      attempts++;
      console.log(`[generator_configurator] Attempt ${attempts}/${maxAttempts} with default provider`);
      rawContent = await requestConfigFromAI(null);
      parsed = extractJsonObject(rawContent);
      if (!parsed) {
        console.warn(`[generator_configurator] Parse failed on attempt ${attempts}. Retrying...`);
      }
    }

    // Final fallback to AWS Bedrock if still not parsed
    if (!parsed) {
      console.log('[generator_configurator] Switching provider to AWS Bedrock as fallback');
      rawContent = await requestConfigFromAI('bedrock');
      parsed = extractJsonObject(rawContent);
    }

    let config = parsed;
    if (!config) {
      console.error('[generator_configurator] Failed to parse AI response as JSON after retries. Last raw content:', rawContent);
      throw new Error(`Die KI hat keine gültige JSON-Konfiguration zurückgegeben (versucht: ${attempts}x, dann AWS Fallback).`);
    }
    console.log('[generator_configurator] Parsed AI Response:', config);

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
        config.description = `Ein Grünerator für: ${config.name}`; // Provide a generic description
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
        const fieldType = (field.type === 'textarea' || field.type === 'text' || field.type === 'select') ? field.type : 'text';
        
        // Handle options for select fields
        let options = [];
        if (fieldType === 'select') {
            if (Array.isArray(field.options)) {
                options = field.options.map(opt => {
                    if (typeof opt === 'string') {
                        // Simple string - create label/value from it
                        return {
                            label: opt,
                            value: generateSanitizedName(opt)
                        };
                    } else if (opt && typeof opt === 'object') {
                        // Object with label (and optional value)
                        const label = (opt.label || opt.text || '').toString().trim();
                        const value = opt.value || generateSanitizedName(label);
                        return label ? { label, value } : null;
                    }
                    return null;
                }).filter(opt => opt && opt.label);
            }
            // Ensure at least one option exists for select fields
            if (options.length === 0) {
                options = [{ label: 'Option 1', value: 'option_1' }];
            }
        }

        const sanitizedField = {
            label: field.label.trim(),
            name: sanitizedName, // Ensure name is derived correctly
            type: fieldType, // Default to 'text' if invalid
            required: typeof field.required === 'boolean' ? field.required : false, // Default to false
            placeholder: (field.placeholder && typeof field.placeholder === 'string') ? field.placeholder.trim() : '' // Optional placeholder
        };

        // Only add options property for select fields
        if (fieldType === 'select') {
            sanitizedField.options = options;
        }

        return sanitizedField;
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

export default router;
