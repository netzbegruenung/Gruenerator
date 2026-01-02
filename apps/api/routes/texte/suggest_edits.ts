import express, { Router, Request, Response } from 'express';
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '../../utils/logger.js';
import type { EditChange, EditSuggestionResult, JsonParsable } from '../../types/routes.js';
import type { EditGenerationContext } from '../../utils/editContextBuilder.js';

const router: Router = express.Router();
const log = createLogger('claude_suggest_');

interface SuggestEditsRequestBody {
  instruction: string;
  currentText: string;
  componentName?: string;
}

interface FunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

function parseJsonSafe(raw: JsonParsable): EditSuggestionResult | null {
  if (typeof raw !== 'string') return raw as unknown as EditSuggestionResult;

  try {
    return JSON.parse(raw) as EditSuggestionResult;
  } catch (e1) {
    log.debug('[parseJsonSafe] Initial parse failed, trying fallback strategies');

    let cleaned = raw
      .replace(/```json\s*\n?|```\s*\n?/g, '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/~~/g, '')
      .trim();
    log.debug('[parseJsonSafe] Step 1 (removed all markdown):', cleaned.substring(0, 80));

    try {
      return JSON.parse(cleaned) as EditSuggestionResult;
    } catch (e2) {
      log.debug('[parseJsonSafe] Direct parse failed, trying jsonrepair');
    }

    try {
      const repaired = jsonrepair(cleaned);
      log.debug('[parseJsonSafe] jsonrepair succeeded');
      return JSON.parse(repaired) as EditSuggestionResult;
    } catch (e0) {
      log.debug('[parseJsonSafe] jsonrepair failed:', {
        error: (e0 as Error).message,
        inputPreview: cleaned.substring(0, 100),
        inputLength: cleaned.length
      });
    }

    cleaned = cleaned.replace(/"([^"]*?)"/g, (match, content: string) => {
      const cleanContent = content
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/`(.*?)`/g, '$1');
      return `"${cleanContent}"`;
    });
    log.debug('[parseJsonSafe] Step 1.5 (within quotes):', cleaned.substring(0, 80));

    try {
      return JSON.parse(cleaned) as EditSuggestionResult;
    } catch (e2) {

      cleaned = raw.replace(/`+/g, '').trim();
      try {
        return JSON.parse(cleaned) as EditSuggestionResult;
      } catch (e3) {

        const match = cleaned.match(/(\{[\s\S]*\})/);
        if (match) {
          try {
            return JSON.parse(match[1]) as EditSuggestionResult;
          } catch (e4) {
            // Continue to next strategy
          }
        }

        const fixedNewlines = cleaned.replace(/"([^"]*?)(\n)([^"]*?)"/g, (match, before: string, newline: string, after: string) => {
          return `"${before}\\n${after}"`;
        });
        try {
          return JSON.parse(fixedNewlines) as EditSuggestionResult;
        } catch (e5) {
          // Continue to next strategy
        }

        const jsonMatch = cleaned.match(/"changes":\s*\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const wrappedJson = `{${jsonMatch[0]}}`;
            const result = JSON.parse(wrappedJson) as EditSuggestionResult;
            if (Array.isArray(result.changes)) {
              return result;
            }
          } catch (e6) {
            // Fall through to logging
          }
        }

        log.error('[parseJsonSafe] All parsing strategies failed:', {
          originalLength: raw.length,
          originalPreview: raw.substring(0, 200),
          cleanedLength: cleaned.length,
          cleanedPreview: cleaned.substring(0, 200),
          errors: [(e1 as Error).message, (e2 as Error).message, (e3 as Error).message]
        });

        return null;
      }
    }
  }
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { instruction, currentText, componentName } = (req.body || {}) as SuggestEditsRequestBody;

  if (!instruction || !currentText) {
    res.status(400).json({
      error: 'instruction und currentText sind erforderlich.',
      details: { instruction: !!instruction, currentText: !!currentText }
    });
    return;
  }

  let generationContext: EditGenerationContext | null = null;
  if (componentName && req.session?.id) {
    try {
      const { redisClient } = await import('../../utils/redis/index.js');
      const contextKey = `edit_context:${req.session.id}:${componentName}`;

      const cached = await redisClient.get(contextKey);
      if (cached) {
        generationContext = JSON.parse(cached as string) as EditGenerationContext;
        log.debug('[claude_suggest_edits] Retrieved generation context from cache');
      }
    } catch (err) {
      log.error('[claude_suggest_edits] Failed to retrieve context:', (err as Error).message);
    }
  }

  try {
    const { buildEditContextSummary } = await import('../../utils/editContextBuilder.js');
    const contextSummary = buildEditContextSummary(generationContext);

    const systemPrompt = `Du bist ein präziser Text-Editor. ${contextSummary ? 'Du kennst den Kontext der ursprünglichen Generierung und berücksichtigst ihn bei Änderungen. ' : ''}Gib AUSSCHLIESSLICH valides JSON zurück.`;

    const userContent = `${contextSummary}STRENGE REGELN:
1. Keine **, *, __, ~~, \` Zeichen im JSON
2. Keine \`\`\`json oder \`\`\` Codeblöcke
3. Nur das JSON-Objekt, keine Erklärungen
4. Beginne direkt mit {

FORMAT:
{
  "changes": [
    { "text_to_find": "exakter Originaltext", "replacement_text": "neuer Text" }
  ],
  "summary": "Kurze Bestätigung"
}

FÜR KOMPLETTE TEXT-UMSCHREIBUNGEN (Gedicht, andere Sprache, komplett neuer Stil):
{
  "changes": [
    { "full_replace": true, "replacement_text": "komplett neuer Text" }
  ],
  "summary": "Text komplett umgeschrieben"
}

WICHTIG:
- Für kleine Änderungen: text_to_find MUSS exakt im Text vorkommen
- Für komplette Umschreibungen: full_replace: true verwenden
- Alle \\n in Strings escapen
- summary: 1-2 Sätze, optional 1 passendes Emoji (✏️✂️✅)

AKTUELLER TEXT (Markdown):
---
${currentText}
---

NUTZER-ANWEISUNG:
${instruction}

Gib NUR das JSON-Objekt gemäß Spezifikation zurück.`;

    const tools: FunctionTool[] = [{
      type: "function",
      function: {
        name: "suggest_edits",
        description: "Suggest precise text edits",
        parameters: {
          type: "object",
          properties: {
            changes: {
              type: "array",
              description: "Array of text changes to make",
              items: {
                type: "object",
                properties: {
                  text_to_find: {
                    type: "string",
                    description: "Exact text from the original that should be replaced. Can be empty if full_replace is true."
                  },
                  replacement_text: {
                    type: "string",
                    description: "New text to replace it with"
                  },
                  full_replace: {
                    type: "boolean",
                    description: "If true, replace entire text content with replacement_text (ignore text_to_find). Use for complete text rewrites."
                  }
                },
                required: ["replacement_text"]
              }
            },
            summary: {
              type: "string",
              description: "Brief summary of changes made (1-2 sentences, optional emoji)"
            }
          },
          required: ["changes", "summary"]
        }
      }
    }];

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      options: {
        max_tokens: 4096,
        temperature: 0.3,
        tools: tools,
        tool_choice: { type: "function", function: { name: "suggest_edits" } }
      }
    }, req);

    if (!result?.success) {
      res.status(500).json({ error: result?.error || 'AI-Verarbeitung fehlgeschlagen' });
      return;
    }

    let parsed: EditSuggestionResult | null = null;
    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls.find(tc => tc.name === 'suggest_edits');
      if (toolCall && toolCall.input) {
        parsed = toolCall.input as EditSuggestionResult;
      }
    }

    if (!parsed && result.content) {
      parsed = parseJsonSafe(result.content);
    }

    if (!parsed || !Array.isArray(parsed.changes)) {
      log.error('[claude_suggest_edits] JSON parsing failed:', {
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        contentPreview: result.content?.substring(0, 300) || '',
        parsedType: typeof parsed,
        parsedValue: parsed,
        hasChangesProperty: parsed && 'changes' in parsed,
        changesType: parsed ? typeof parsed.changes : 'undefined'
      });

      res.json({
        changes: [],
        summary: '',
        raw: result.content,
        needsFrontendParsing: true,
        debug: {
          backendParsingFailed: true,
          received: typeof parsed,
          hasChanges: parsed && 'changes' in parsed,
          changesType: parsed ? typeof parsed.changes : 'undefined'
        }
      });
      return;
    }

    const validChanges = parsed.changes.filter((c: EditChange) => {
      if (!c || typeof c.replacement_text !== 'string') return false;
      return (c.full_replace === true) || (typeof c.text_to_find === 'string');
    });

    const summary = parsed.summary || `${validChanges.length} ${validChanges.length === 1 ? 'Änderung' : 'Änderungen'} durchgeführt! ✅`;
    res.json({ changes: validChanges, summary });
  } catch (error) {
    log.error('[claude_suggest_edits] Fehler:', error);
    res.status(500).json({ error: 'Interner Fehler bei der Bearbeitung', details: (error as Error).message });
  }
});

export default router;
