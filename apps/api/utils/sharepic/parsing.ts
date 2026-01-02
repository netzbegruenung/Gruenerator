import { createLogger } from '../logger.js';

const log = createLogger('sharepic-parsing');

/**
 * Extract clean JSON object from malformed AI responses
 * Handles markdown code blocks and extracts the first valid JSON object
 */
export function extractCleanJSON(content: string | null | undefined): Record<string, unknown> | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const cleanedContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    } catch (parseError) {
      log.warn('[extractCleanJSON] Parse error:', (parseError as Error).message);
      const fallbackMatch = cleanedContent.match(/\{[^{}]*\}/);
      if (fallbackMatch) {
        try {
          return JSON.parse(fallbackMatch[0]);
        } catch (fallbackError) {
          log.warn('[extractCleanJSON] Fallback parse error:', (fallbackError as Error).message);
        }
      }
    }
  }

  return null;
}

/**
 * Extract clean JSON array from malformed AI responses
 * Handles markdown code blocks and extracts the first valid JSON array
 */
export function extractCleanJSONArray(content: string | null | undefined): unknown[] | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const cleanedContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (parseError) {
      log.warn('[extractCleanJSONArray] Parse error:', (parseError as Error).message);
    }
  }

  return null;
}

interface QuoteItem {
  quote: string;
  [key: string]: unknown;
}

/**
 * Normalize slightly messy model responses into valid JSON arrays
 * Specifically designed for quote extraction
 */
export function extractQuoteArray(content: string | null | undefined): QuoteItem[] | null {
  if (typeof content !== 'string') {
    return null;
  }

  const withoutCodeFences = content
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '');

  const match = withoutCodeFences.match(/\[[\s\S]*\]/);
  if (!match) {
    return null;
  }

  let candidate = match[0]
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*(?=[}\]])/g, '');

  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    log.warn('[sharepic] Failed to parse sanitized JSON response', error);
    return null;
  }
}

export interface Slogan {
  line1: string;
  line2: string;
  line3: string;
}

/**
 * Parse dreizeilen response from AI content
 * Finds first group of 3 consecutive valid lines
 */
export function parseDreizeilenResponse(content: string, _skipShortener: boolean = false): Slogan {
  log.debug(`[parser] Received content starting with: "${content.substring(0, 30)}"`);

  const allLines = content.split('\n');

  for (let i = 0; i <= allLines.length - 3; i++) {
    const line1 = allLines[i].trim();
    const line2 = allLines[i + 1].trim();
    const line3 = allLines[i + 2].trim();

    if (line1 && line2 && line3) {
      log.debug(`[parser] Checking lines: ["${line1}", "${line2}", "${line3}"]`);

      if (line1.toLowerCase().includes('suchbegriff') ||
          line2.toLowerCase().includes('suchbegriff') ||
          line3.toLowerCase().includes('suchbegriff')) {
        log.debug(`[parser] Rejected: contains 'suchbegriff'`);
        continue;
      }

      if (line1.length < 3 || line1.length > 35 ||
          line2.length < 3 || line2.length > 35 ||
          line3.length < 3 || line3.length > 35) {
        log.debug(`[parser] Rejected: length issue [${line1.length}, ${line2.length}, ${line3.length}]`);
        continue;
      }

      log.debug(`[parser] SUCCESS - returning valid slogan`);
      return { line1, line2, line3 };
    }
  }

  log.debug(`[parser] FAILED - no valid lines found in ${allLines.length} total lines`);
  return { line1: '', line2: '', line3: '' };
}

/**
 * Clean line by removing prefixes like "Zeile 1:", "Line 1:", etc.
 */
export function cleanLine(line: string): string {
  return line.replace(/^(Zeile|Line|Línea)?\s*\d+\s*:\s*/i, '').trim();
}
