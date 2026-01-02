/**
 * JSON Parser Utilities
 * Robust JSON parsing with repair capabilities for AI-generated content
 */

import { createLogger } from './logger.js';

const log = createLogger('jsonParser');

/**
 * Escape bare newlines inside JSON string literals
 * Helps repair malformed JSON from AI responses
 */
function escapeBareNewlinesInStrings(input: string): string {
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
      if (ch === '\\' && !escape) {
        escape = true;
      } else {
        escape = false;
      }
    } else {
      out += ch;
      if (ch === '"' && !escape) {
        inString = true;
      }
      escape = (ch === '\\') ? !escape : false;
    }
  }
  return out;
}

/**
 * Extract and parse a JSON object from potentially messy AI response
 * Handles:
 * - Markdown code fences (```json ... ```)
 * - Quoted payloads
 * - Smart quotes
 * - Prose wrapping the JSON
 * - Bare newlines in strings
 */
export function extractJsonObject<T = Record<string, unknown>>(raw: unknown): T | null {
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

  log.debug('[jsonParser] Parsing JSON preview:', {
    startsWithCurly: text.trim().startsWith('{'),
    endsWithCurly: text.trim().endsWith('}'),
    length: text.length
  });

  // Try parse directly first
  try {
    return JSON.parse(text) as T;
  } catch {
    // Second attempt: escape bare newlines in string literals and retry
    const repaired = escapeBareNewlinesInStrings(text);
    try {
      return JSON.parse(repaired) as T;
    } catch (e2) {
      const err = e2 as Error;
      const msg = String(err.message || '');
      const m = msg.match(/position\s+(\d+)/i);
      const pos = m ? parseInt(m[1], 10) : -1;

      if (pos >= 0) {
        const start = Math.max(0, pos - 60);
        const end = Math.min(repaired.length, pos + 60);
        log.error('[jsonParser] JSON parse error around position', pos, 'context:', repaired.slice(start, end));
      } else {
        log.error('[jsonParser] JSON parse error:', msg);
      }
      return null;
    }
  }
}
