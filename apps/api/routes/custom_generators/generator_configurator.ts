/**
 * Generator Configurator Routes
 * AI-powered creation of custom generator configurations
 */

import express, { type Response, type Router } from 'express';

import { extractJsonObject } from '../../utils/jsonParser.js';
import { createLogger } from '../../utils/logger.js';
import { generateSanitizedName, sanitizeSlug } from '../../utils/stringUtils.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('generator_configurator');
const router: Router = express.Router();

interface FieldOption {
  label: string;
  value: string;
}

interface GeneratorField {
  label: string;
  name: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  placeholder: string;
  options?: FieldOption[];
}

interface GeneratorConfig {
  name: string;
  slug: string;
  title: string;
  description: string;
  prompt: string;
  fields: GeneratorField[];
}

interface AIGeneratedConfig {
  name?: string;
  slug?: string;
  title?: string;
  description?: string;
  prompt?: string;
  fields?: Array<{
    label?: string;
    name?: string;
    type?: string;
    required?: boolean;
    placeholder?: string;
    options?: Array<string | { label?: string; text?: string; value?: string }>;
  }>;
}

interface ConfigRequestBody {
  description: string;
}

interface AIWorkerRequest {
  type: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  options: { temperature: number };
  provider?: string;
}

const SYSTEM_PROMPT = `Du bist ein Assistent, der JSON-Konfigurationen für Grüneatoren erstellt. Verwende niemals das Wort "Generator", sondern immer "Grünerator".`;

function buildUserPrompt(description: string): string {
  return `Erstelle eine Grünerator-Konfiguration für folgende Beschreibung:
"${description}"

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
}

function sanitizeFieldOptions(
  options: Array<string | { label?: string; text?: string; value?: string }> | undefined
): FieldOption[] {
  if (!Array.isArray(options)) return [];

  return options
    .map((opt) => {
      if (typeof opt === 'string') {
        return { label: opt, value: generateSanitizedName(opt) };
      } else if (opt && typeof opt === 'object') {
        const label = (opt.label || opt.text || '').toString().trim();
        const value = opt.value || generateSanitizedName(label);
        return label ? { label, value } : null;
      }
      return null;
    })
    .filter((opt): opt is FieldOption => opt !== null && !!opt.label);
}

function sanitizeFields(fields: AIGeneratedConfig['fields']): GeneratorField[] {
  if (!Array.isArray(fields)) return [];

  const sanitized = fields
    .map((field) => {
      if (!field || typeof field !== 'object' || !field.label || typeof field.label !== 'string') {
        log.warn(
          '[generator_configurator] Invalid field object received from AI, skipping:',
          field
        );
        return null;
      }

      const sanitizedName = generateSanitizedName(field.label);
      const fieldType = ['textarea', 'text', 'select'].includes(field.type || '')
        ? (field.type as 'text' | 'textarea' | 'select')
        : 'text';

      const result: GeneratorField = {
        label: field.label.trim(),
        name: sanitizedName,
        type: fieldType,
        required: typeof field.required === 'boolean' ? field.required : false,
        placeholder:
          field.placeholder && typeof field.placeholder === 'string'
            ? field.placeholder.trim()
            : '',
      };

      if (fieldType === 'select') {
        const options = sanitizeFieldOptions(field.options);
        result.options = options.length > 0 ? options : [{ label: 'Option 1', value: 'option_1' }];
      }

      return result;
    })
    .filter((field): field is GeneratorField => field !== null);

  // Deduplicate field names
  const counts: Record<string, number> = {};
  return sanitized.map((f) => {
    counts[f.name] = (counts[f.name] || 0) + 1;
    if (counts[f.name] > 1) {
      f.name = `${f.name}_${counts[f.name] - 1}`;
    }
    return f;
  });
}

function validateAndSanitizeConfig(raw: AIGeneratedConfig): GeneratorConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Ungültige Konfigurationsstruktur von der KI empfangen.');
  }
  if (!raw.name || typeof raw.name !== 'string' || raw.name.trim() === '') {
    throw new Error('Name fehlt oder ist ungültig.');
  }
  if (!raw.slug || typeof raw.slug !== 'string' || raw.slug.trim() === '') {
    throw new Error('Slug fehlt oder ist ungültig.');
  }
  if (!raw.prompt || typeof raw.prompt !== 'string' || raw.prompt.trim() === '') {
    throw new Error('Prompt fehlt oder ist ungültig.');
  }
  if (!Array.isArray(raw.fields)) {
    throw new Error('Felder fehlen oder sind kein Array.');
  }

  const title =
    raw.title && typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : raw.name;

  const description =
    raw.description && typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : `Ein Grünerator für: ${raw.name}`;

  let fields = sanitizeFields(raw.fields);
  if (fields.length > 5) {
    log.warn('[generator_configurator] AI generated more than 5 fields, trimming.');
    fields = fields.slice(0, 5);
  }

  if (fields.some((f) => !f.name)) {
    throw new Error('Ein Feld konnte keinen technischen Namen generieren.');
  }

  return {
    name: raw.name.trim(),
    slug: sanitizeSlug(raw.slug),
    title,
    description,
    prompt: raw.prompt.trim(),
    fields,
  };
}

/**
 * POST / - Generate a custom generator configuration from description
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { description } = req.body as ConfigRequestBody;

  if (!description || typeof description !== 'string' || description.trim() === '') {
    res.status(400).json({ error: 'Beschreibung darf nicht leer sein.' });
    return;
  }

  try {
    const userContent = buildUserPrompt(description);

    const requestConfigFromAI = async (providerOverride: string | null = null): Promise<string> => {
      const requestPayload: AIWorkerRequest = {
        type: 'generator_config',
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        options: { temperature: 0.1 },
      };

      if (providerOverride) {
        requestPayload.provider = providerOverride;
      }

      const result = await req.app.locals.aiWorkerPool.processRequest(requestPayload);

      if (!result.success) {
        throw new Error(result.error || 'AI worker failed to generate configuration.');
      }

      log.debug('[generator_configurator] AI provider/meta:', {
        provider: result?.metadata?.provider,
        model: result?.metadata?.model,
        contentLength: result?.content?.length,
        providerOverride,
      });

      return result.content;
    };

    // Attempt up to 3 times with default provider, then fallback to AWS Bedrock
    let rawContent: string | null = null;
    let parsed: AIGeneratedConfig | null = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !parsed) {
      attempts++;
      log.debug(
        `[generator_configurator] Attempt ${attempts}/${maxAttempts} with default provider`
      );
      rawContent = await requestConfigFromAI(null);
      parsed = extractJsonObject<AIGeneratedConfig>(rawContent);
      if (!parsed) {
        log.warn(`[generator_configurator] Parse failed on attempt ${attempts}. Retrying...`);
      }
    }

    // Final fallback to AWS Bedrock
    if (!parsed) {
      log.debug('[generator_configurator] Switching provider to AWS Bedrock as fallback');
      rawContent = await requestConfigFromAI('bedrock');
      parsed = extractJsonObject<AIGeneratedConfig>(rawContent);
    }

    if (!parsed) {
      log.error(
        '[generator_configurator] Failed to parse AI response as JSON after retries. Last raw content:',
        rawContent
      );
      throw new Error(
        `Die KI hat keine gültige JSON-Konfiguration zurückgegeben (versucht: ${attempts}x, dann AWS Fallback).`
      );
    }

    log.debug('[generator_configurator] Parsed AI Response:', parsed);

    const config = validateAndSanitizeConfig(parsed);

    log.debug('[generator_configurator] Sending sanitized config to frontend:', config);
    res.json(config);
  } catch (error) {
    const err = error as Error;
    log.error('[generator_configurator] Fehler bei der Konfigurationserstellung:', err);
    res.status(500).json({
      error: 'Fehler bei der Erstellung der Generator-Konfiguration.',
      details: err.message,
    });
  }
});

export default router;
