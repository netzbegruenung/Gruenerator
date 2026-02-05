import express, { type Router, type Request, type Response } from 'express';
import { jsonrepair } from 'jsonrepair';

import { createLogger } from '../../utils/logger.js';

import type { EditChange, EditSuggestionResult, JsonParsable } from '../../types/routes.js';
import type { EditGenerationContext } from '../../utils/editContextBuilder.js';

const router: Router = express.Router();
const log = createLogger('claude_suggest_');

// Debug helper: Find similar substrings (80%+ character match)
function findSimilarSubstrings(haystack: string, needle: string, maxResults = 3): string[] {
  const results: string[] = [];
  const needleLen = needle.length;
  if (needleLen === 0 || haystack.length < needleLen) return results;

  for (let i = 0; i <= haystack.length - needleLen && results.length < maxResults; i++) {
    const substring = haystack.substring(i, i + needleLen);
    let matches = 0;
    for (let j = 0; j < needleLen; j++) {
      if (substring[j] === needle[j]) matches++;
    }
    const similarity = matches / needleLen;
    if (similarity >= 0.8) {
      results.push(
        `pos=${i}: "${substring.substring(0, 50)}..." (${Math.round(similarity * 100)}%)`
      );
    }
  }
  return results;
}

// Debug helper: Find first mismatch position
function findFirstMismatch(haystack: string, needle: string): string | null {
  const searchPrefix = needle.substring(0, Math.min(10, needle.length));
  const idx = haystack.indexOf(searchPrefix);
  if (idx === -1) {
    return `Cannot find first 10 chars: "${JSON.stringify(searchPrefix)}"`;
  }
  for (let i = 0; i < needle.length && idx + i < haystack.length; i++) {
    if (haystack[idx + i] !== needle[i]) {
      return `Mismatch at pos ${i}: haystack='${haystack[idx + i]}' (charCode=${haystack.charCodeAt(idx + i)}) vs needle='${needle[i]}' (charCode=${needle.charCodeAt(i)})`;
    }
  }
  if (idx + needle.length > haystack.length) {
    return `Needle extends beyond haystack (haystack ends at ${haystack.length}, needle needs ${idx + needle.length})`;
  }
  return null;
}

// Debug helper: Detect invisible character issues
function detectInvisibleChars(text: string): string[] {
  const issues: string[] = [];
  if (text.includes('\u00A0'))
    issues.push(
      `Contains non-breaking spaces (\\u00A0) at positions: ${[...text]
        .map((c, i) => (c === '\u00A0' ? i : -1))
        .filter((i) => i >= 0)
        .slice(0, 5)
        .join(', ')}`
    );
  if (text.includes('\r')) issues.push('Contains carriage returns (\\r)');
  if (text.includes('\u200B')) issues.push('Contains zero-width spaces (\\u200B)');
  if (text.includes('\u2018') || text.includes('\u2019'))
    issues.push('Contains smart single quotes');
  if (text.includes('\u201C') || text.includes('\u201D'))
    issues.push('Contains smart double quotes');
  return issues;
}

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

/**
 * Convert a structured JSON object (as returned by Mistral for full_replace)
 * into readable markdown text. Handles nested objects and arrays recursively.
 */
function structuredObjectToMarkdown(obj: unknown, depth = 0): string {
  if (typeof obj === 'string') return obj;
  if (obj == null || typeof obj !== 'object') return String(obj ?? '');

  if (Array.isArray(obj)) {
    return obj
      .map((item) => {
        const text = structuredObjectToMarkdown(item, depth);
        return typeof item === 'object' && item !== null && !Array.isArray(item)
          ? text
          : `- ${text}`;
      })
      .join('\n');
  }

  const lines: string[] = [];
  const heading = depth === 0 ? '##' : depth === 1 ? '###' : '####';

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    if (typeof value === 'string') {
      lines.push(`**${label}:** ${value}`);
    } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      lines.push(`${heading} ${label}`);
      lines.push(value.map((v) => `- ${v}`).join('\n'));
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${heading} ${label}`);
      lines.push(structuredObjectToMarkdown(value, depth + 1));
    } else {
      lines.push(`**${label}:** ${String(value)}`);
    }
  }

  return lines.join('\n\n');
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
        inputLength: cleaned.length,
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

        const fixedNewlines = cleaned.replace(
          /"([^"]*?)(\n)([^"]*?)"/g,
          (match, before: string, newline: string, after: string) => {
            return `"${before}\\n${after}"`;
          }
        );
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
          errors: [(e1 as Error).message, (e2 as Error).message, (e3 as Error).message],
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
      details: { instruction: !!instruction, currentText: !!currentText },
    });
    return;
  }

  // DEBUG: Log the incoming request with escaped text to reveal invisible characters
  log.debug('[claude_suggest_edits] === REQUEST RECEIVED ===');
  log.debug('[claude_suggest_edits] instruction:', instruction);
  log.debug('[claude_suggest_edits] currentText length:', currentText.length);
  log.debug(
    '[claude_suggest_edits] currentText (escaped):',
    JSON.stringify(currentText.substring(0, 500))
  );
  const currentTextIssues = detectInvisibleChars(currentText);
  if (currentTextIssues.length > 0) {
    log.debug('[claude_suggest_edits] currentText invisible char issues:', currentTextIssues);
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

    const systemPrompt = `Du bist ein Text-Editor. Du änderst NUR Text der EXAKT im Original vorkommt.${contextSummary ? ' Kontext der Generierung ist bekannt.' : ''}`;

    const userContent = `TEXT:
---
${currentText}
---

AUFGABE: ${instruction}

REGELN:
- text_to_find: Kopiere EXAKT aus TEXT oben. Erfinde NICHTS.
- Für komplette Neufassung: full_replace: true
${contextSummary ? `\nKONTEXT: ${contextSummary}` : ''}`;

    const tools: FunctionTool[] = [
      {
        type: 'function',
        function: {
          name: 'suggest_edits',
          description: 'Suggest precise text edits',
          parameters: {
            type: 'object',
            properties: {
              changes: {
                type: 'array',
                description: 'Array of text changes to make',
                items: {
                  type: 'object',
                  properties: {
                    text_to_find: {
                      type: 'string',
                      description:
                        'Exact text from the original that should be replaced. Can be empty if full_replace is true.',
                    },
                    replacement_text: {
                      type: 'string',
                      description: 'New text to replace it with',
                    },
                    full_replace: {
                      type: 'boolean',
                      description:
                        'If true, replace entire text content with replacement_text (ignore text_to_find). Use for complete text rewrites.',
                    },
                  },
                  required: ['replacement_text'],
                },
              },
              summary: {
                type: 'string',
                description: 'Brief summary of changes made (1-2 sentences, optional emoji)',
              },
            },
            required: ['changes', 'summary'],
          },
        },
      },
    ];

    const result = await req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'text_adjustment',
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        options: {
          max_tokens: 4096,
          temperature: 0.3,
          tools: tools,
          tool_choice: { type: 'function', function: { name: 'suggest_edits' } },
        },
      },
      req
    );

    log.debug('[claude_suggest_edits] AI result:', {
      success: result?.success,
      hasContent: !!result?.content,
      contentLength: result?.content?.length || 0,
      contentPreview: result?.content?.substring(0, 500) || '',
      stopReason: result?.stop_reason,
      hasToolCalls: !!(result?.tool_calls && result.tool_calls.length > 0),
      toolCallCount: result?.tool_calls?.length || 0,
      toolCalls: result?.tool_calls?.map((tc: { name: string; input?: unknown }) => ({
        name: tc.name,
        hasInput: !!tc.input,
        inputType: typeof tc.input,
        inputPreview: tc.input ? JSON.stringify(tc.input).substring(0, 300) : null,
      })),
    });

    if (!result?.success) {
      res.status(500).json({ error: result?.error || 'AI-Verarbeitung fehlgeschlagen' });
      return;
    }

    let parsed: EditSuggestionResult | null = null;
    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls.find(
        (tc: { name: string; input?: unknown }) => tc.name === 'suggest_edits'
      );
      log.debug('[claude_suggest_edits] Tool call lookup:', {
        foundToolCall: !!toolCall,
        toolCallName: toolCall?.name,
        toolCallInput: toolCall?.input ? JSON.stringify(toolCall.input).substring(0, 500) : null,
      });
      if (toolCall && toolCall.input) {
        parsed = toolCall.input as EditSuggestionResult;
      }
    }

    if (!parsed && result.content) {
      log.debug(
        '[claude_suggest_edits] Falling back to parseJsonSafe, content:',
        result.content.substring(0, 500)
      );
      parsed = parseJsonSafe(result.content);
      log.debug('[claude_suggest_edits] parseJsonSafe result:', {
        parsedNull: parsed === null,
        parsedType: typeof parsed,
        hasChanges: parsed ? 'changes' in parsed : false,
        changesIsArray: parsed ? Array.isArray(parsed.changes) : false,
      });
    }

    if (!parsed || !Array.isArray(parsed.changes)) {
      log.error('[claude_suggest_edits] JSON parsing failed:', {
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        contentPreview: result.content?.substring(0, 300) || '',
        parsedType: typeof parsed,
        parsedValue: parsed,
        hasChangesProperty: parsed && 'changes' in parsed,
        changesType: parsed ? typeof parsed.changes : 'undefined',
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
          changesType: parsed ? typeof parsed.changes : 'undefined',
        },
      });
      return;
    }

    // Normalize changes: coerce object replacement_text to markdown string
    // Mistral sometimes returns structured JSON objects instead of plain text
    for (const change of parsed.changes) {
      if (change && change.replacement_text && typeof change.replacement_text !== 'string') {
        log.debug('[claude_suggest_edits] Coercing object replacement_text to markdown string');
        change.replacement_text = structuredObjectToMarkdown(change.replacement_text);
      }
    }

    const validChanges = parsed.changes.filter((c: EditChange) => {
      if (!c || typeof c.replacement_text !== 'string') return false;
      return c.full_replace === true || typeof c.text_to_find === 'string';
    });

    // DEBUG: Log each change and whether it matches the currentText
    log.debug('[claude_suggest_edits] === CHANGES ANALYSIS ===');
    log.debug('[claude_suggest_edits] Total changes from AI:', parsed.changes.length);
    log.debug('[claude_suggest_edits] Valid changes:', validChanges.length);

    for (let i = 0; i < validChanges.length; i++) {
      const change = validChanges[i];
      log.debug(`[claude_suggest_edits] --- Change ${i + 1} ---`);

      if (change.full_replace === true) {
        log.debug('[claude_suggest_edits] Type: FULL_REPLACE');
        log.debug(
          '[claude_suggest_edits] replacement_text preview:',
          change.replacement_text.substring(0, 100)
        );
      } else if (change.text_to_find) {
        log.debug('[claude_suggest_edits] Type: PARTIAL_REPLACE');
        log.debug(
          '[claude_suggest_edits] text_to_find (escaped):',
          JSON.stringify(change.text_to_find)
        );
        log.debug('[claude_suggest_edits] text_to_find length:', change.text_to_find.length);
        log.debug(
          '[claude_suggest_edits] replacement_text (escaped):',
          JSON.stringify(change.replacement_text.substring(0, 100))
        );

        // Check if text_to_find exists in currentText
        const exactMatch = currentText.includes(change.text_to_find);
        log.debug('[claude_suggest_edits] EXACT MATCH IN CURRENT TEXT:', exactMatch);

        if (!exactMatch) {
          // Analyze why it doesn't match
          const textToFindIssues = detectInvisibleChars(change.text_to_find);
          if (textToFindIssues.length > 0) {
            log.debug(
              '[claude_suggest_edits] text_to_find invisible char issues:',
              textToFindIssues
            );
          }

          const firstMismatch = findFirstMismatch(currentText, change.text_to_find);
          if (firstMismatch) {
            log.debug('[claude_suggest_edits] First mismatch:', firstMismatch);
          }

          const similar = findSimilarSubstrings(currentText, change.text_to_find);
          if (similar.length > 0) {
            log.debug('[claude_suggest_edits] Similar substrings found:', similar);
          } else {
            log.debug('[claude_suggest_edits] No similar substrings found (>=80% match)');
          }

          // Log first 5 char codes from both
          const needle = change.text_to_find;
          log.debug(
            '[claude_suggest_edits] First 10 charCodes of text_to_find:',
            [...needle.substring(0, 10)].map((c, i) => `[${i}]'${c}'=${c.charCodeAt(0)}`).join(' ')
          );
        }
      }
    }

    const summary =
      parsed.summary ||
      `${validChanges.length} ${validChanges.length === 1 ? 'Änderung' : 'Änderungen'} durchgeführt! ✅`;
    res.json({ changes: validChanges, summary });
  } catch (error) {
    log.error('[claude_suggest_edits] Fehler:', error);
    res
      .status(500)
      .json({ error: 'Interner Fehler bei der Bearbeitung', details: (error as Error).message });
  }
});

export default router;
