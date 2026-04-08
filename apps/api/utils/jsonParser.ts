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
      if (ch === '\n') {
        out += '\\n';
        escape = false;
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        escape = false;
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        escape = false;
        continue;
      }
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
      escape = ch === '\\' ? !escape : false;
    }
  }
  return out;
}

/**
 * Find the first brace-balanced JSON object substring starting from a given offset.
 * Returns the substring or null if no complete object is found.
 */
function findBraceBalancedObject(text: string, startFrom = 0): string | null {
  const braceStart = text.indexOf('{', startFrom);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(braceStart, i + 1);
      }
    }
  }

  return null;
}

/**
 * Find all brace-balanced JSON object substrings in text.
 */
function findAllBraceBalancedObjects(text: string): string[] {
  const objects: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    const obj = findBraceBalancedObject(text, offset);
    if (!obj) break;
    objects.push(obj);
    offset = text.indexOf(obj, offset) + obj.length;
  }

  return objects;
}

/**
 * Remove literal `...` / `…` tokens from JSON arrays.
 * LLMs often output `["item1", ...]` or `["item1", …]` as shorthand.
 */
export function repairJsonEllipsis(text: string): string {
  return text
    .replace(/,\s*\.{3}\s*]/g, ']')
    .replace(/,\s*…\s*]/g, ']')
    .replace(/\[\s*\.{3}\s*,/g, '[')
    .replace(/\[\s*…\s*,/g, '[')
    .replace(/,\s*\.{3}\s*,/g, ',')
    .replace(/,\s*…\s*,/g, ',');
}

/**
 * Extract the last parseable JSON object from text.
 * When LLMs produce chain-of-thought, the final JSON block is often the correct one.
 * Applies ellipsis repair to each candidate before parsing.
 */
export function extractLastJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const objects = findAllBraceBalancedObjects(text);

  for (let k = objects.length - 1; k >= 0; k--) {
    const repaired = repairJsonEllipsis(objects[k]);
    try {
      return JSON.parse(repaired) as T;
    } catch {
      // try next
    }
  }

  return null;
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
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }

  // Replace smart quotes with normal quotes
  text = text.replace(/[""]/g, '"').replace(/['']/g, "'");

  // Extract the first complete JSON object using brace-depth matching.
  const firstObj = findBraceBalancedObject(text);
  if (firstObj) {
    text = firstObj;
  }

  log.debug('[jsonParser] Parsing JSON preview:', {
    startsWithCurly: text.trim().startsWith('{'),
    endsWithCurly: text.trim().endsWith('}'),
    length: text.length,
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
        log.error(
          '[jsonParser] JSON parse error around position',
          pos,
          'context:',
          repaired.slice(start, end)
        );
      } else {
        log.error('[jsonParser] JSON parse error:', msg);
      }
      return null;
    }
  }
}
