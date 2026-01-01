import express from 'express';
const router = express.Router();
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '../utils/logger.js';
const log = createLogger('claude_suggest_');


// Helper: robust JSON parse with multiple fallback strategies
function parseJsonSafe(raw) {
  if (typeof raw !== 'string') return raw;
  
  // First try parsing as-is
  try {
    return JSON.parse(raw);
  } catch (e1) {
    log.debug('[parseJsonSafe] Initial parse failed, trying fallback strategies');

    // Strategy 1: Remove markdown code blocks and ALL markdown markers
    let cleaned = raw
      .replace(/```json\s*\n?|```\s*\n?/g, '')  // Remove code fences
      .replace(/\*\*/g, '')  // Remove all **
      .replace(/__/g, '')    // Remove all __
      .replace(/~~/g, '')    // Remove all ~~
      .trim();
    log.debug('[parseJsonSafe] Step 1 (removed all markdown):', cleaned.substring(0, 80));

    // Try parsing after aggressive markdown removal
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      log.debug('[parseJsonSafe] Direct parse failed, trying jsonrepair');
    }

    // Strategy 2: Use jsonrepair library on cleaned string
    try {
      const repaired = jsonrepair(cleaned);
      log.debug('[parseJsonSafe] jsonrepair succeeded');
      return JSON.parse(repaired);
    } catch (e0) {
      log.debug('[parseJsonSafe] jsonrepair failed:', {
        error: e0.message,
        inputPreview: cleaned.substring(0, 100),
        inputLength: cleaned.length
      });
    }

    // Strategy 1.5: Remove markdown formatting within JSON strings
    // This handles **bold**, *italic*, etc. within quoted string values
    cleaned = cleaned.replace(/"([^"]*?)"/g, (match, content) => {
      // Remove markdown formatting but preserve the actual text
      const cleanContent = content
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold
        .replace(/\*(.*?)\*/g, '$1')      // Remove italic
        .replace(/__(.*?)__/g, '$1')      // Remove underline
        .replace(/~~(.*?)~~/g, '$1')      // Remove strikethrough
        .replace(/`(.*?)`/g, '$1');       // Remove inline code
      return `"${cleanContent}"`;
    });
    log.debug('[parseJsonSafe] Step 1.5 (within quotes):', cleaned.substring(0, 80));

    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      
      // Strategy 2: Remove all backticks and try again
      cleaned = raw.replace(/`+/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (e3) {
        
        // Strategy 3: Try to extract JSON between first { and last }
        const match = cleaned.match(/(\{[\s\S]*\})/);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch (e4) {
            // Continue to next strategy
          }
        }
        
        // Strategy 4: Fix unescaped newlines within JSON string values
        const fixedNewlines = cleaned.replace(/"([^"]*?)(\n)([^"]*?)"/g, (match, before, newline, after) => {
          return `"${before}\\n${after}"`;
        });
        try {
          return JSON.parse(fixedNewlines);
        } catch (e5) {
          // Continue to next strategy
        }
        
        // Strategy 5: Last resort - look for JSON-like pattern with quotes
        const jsonMatch = cleaned.match(/"changes":\s*\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const wrappedJson = `{${jsonMatch[0]}}`;
            const result = JSON.parse(wrappedJson);
            if (Array.isArray(result.changes)) {
              return result;
            }
          } catch (e6) {
            // Fall through to logging
          }
        }
        
        // All strategies failed - log for debugging
        log.error('[parseJsonSafe] All parsing strategies failed:', {
          originalLength: raw.length,
          originalPreview: raw.substring(0, 200),
          cleanedLength: cleaned.length,
          cleanedPreview: cleaned.substring(0, 200),
          errors: [e1.message, e2.message, e3.message]
        });
        
        return null;
      }
    }
  }
}

router.post('/', async (req, res) => {
  const { instruction, currentText, componentName } = req.body || {};

  if (!instruction || !currentText) {
    return res.status(400).json({
      error: 'instruction und currentText sind erforderlich.',
      details: { instruction: !!instruction, currentText: !!currentText }
    });
  }

  // Retrieve cached generation context if available
  let generationContext = null;
  if (componentName && req.session?.id) {
    try {
      const { default: redisClient } = await import('../utils/redisClient.js');
      const contextKey = `edit_context:${req.session.id}:${componentName}`;

      const cached = await redisClient.get(contextKey);
      if (cached) {
        generationContext = JSON.parse(cached);
        log.debug('[claude_suggest_edits] Retrieved generation context from cache');
      }
    } catch (err) {
      log.error('[claude_suggest_edits] Failed to retrieve context:', err.message);
    }
  }

  try {
    // Build context summary if available
    const { buildEditContextSummary } = await import('../utils/editContextBuilder.js');
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

    // Define structured output schema for reliable parsing
    const tools = [{
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
      return res.status(500).json({ error: result?.error || 'AI-Verarbeitung fehlgeschlagen' });
    }

    // Handle function calling response (structured output)
    let parsed = null;
    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls.find(tc => tc.name === 'suggest_edits');
      if (toolCall && toolCall.input) {
        parsed = toolCall.input;
      }
    }

    // Fallback to regular JSON parsing if no tool call
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
      
      // Send raw content for frontend fallback parsing
      return res.json({
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
    }

    // Validate elements
    const validChanges = parsed.changes.filter(c => {
      if (!c || typeof c.replacement_text !== 'string') return false;
      // Allow either: (1) normal edit with text_to_find, or (2) full_replace mode
      return (c.full_replace === true) || (typeof c.text_to_find === 'string');
    });

    const summary = parsed.summary || `${validChanges.length} ${validChanges.length === 1 ? 'Änderung' : 'Änderungen'} durchgeführt! ✅`;
    return res.json({ changes: validChanges, summary });
  } catch (error) {
    log.error('[claude_suggest_edits] Fehler:', error);
    return res.status(500).json({ error: 'Interner Fehler bei der Bearbeitung', details: error.message });
  }
});

export default router;