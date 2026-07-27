import { createLogger } from '../logger.js';

const log = createLogger('sharepic-textParser');

export interface ParseResult {
  success: boolean;
  data: Record<string, string>;
  error?: string;
}

/**
 * A source/attribution line the model appended to a field on its own initiative
 * — "— Herbert Kickl, ORF-Interview, 3.3.2026", "(Quelle: ORF, 2026)",
 * "– Studie des Umweltbundesamts".
 *
 * Matched narrowly so real content survives: either an explicit source keyword,
 * or a dash-led line that looks like `Name, Kontext[, Datum]` rather than prose.
 * A dash-led line that reads as a sentence (has a finite verb's worth of words
 * without commas) is kept.
 */
const ATTRIBUTION_LINE_RE =
  /^\s*(?:[—–-]{1,2}\s*)?\(?\s*(?:quelle|source|foto|bild|credit|nach)\s*:.*$|^\s*[—–-]{1,2}\s*[^,\n]{2,60}(?:,\s*[^,\n]{2,60}){1,3}\s*\.?\s*$/iu;

export function isAttributionLine(line: string): boolean {
  return ATTRIBUTION_LINE_RE.test(line);
}

/**
 * Parse labeled text format from AI response.
 *
 * Expected format:
 * LABEL1: value1
 * LABEL2: value2 that can span
 * multiple lines until next label
 * LABEL3: value3
 *
 * @param content - Raw AI response text
 * @param expectedFields - Array of field names to extract (lowercase)
 * @param optionalFields - Array of field names that are optional (lowercase)
 * @returns ParseResult with success status and extracted data
 */
export function parseLabeledText(
  content: string | null | undefined,
  expectedFields: string[],
  optionalFields: string[] = []
): ParseResult {
  if (!content || typeof content !== 'string') {
    return { success: false, data: {}, error: 'Empty or invalid content' };
  }

  const cleanedContent = content
    .replace(/```(?:json|text|)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,2}/g, '')
    .trim();

  if (!cleanedContent) {
    return { success: false, data: {}, error: 'Content empty after cleanup' };
  }

  const data: Record<string, string> = {};
  const upperFields = expectedFields.map((f) => f.toUpperCase());
  const allFields = [...upperFields, ...optionalFields.map((f) => f.toUpperCase())];
  const labelPattern = new RegExp(`^(${allFields.join('|')}):\\s*`, 'i');

  // Normalize: split mid-line labels onto their own lines
  const splitPattern = new RegExp(`(\\S)\\s+(${allFields.join('|')}):\\s`, 'gi');
  const normalizedContent = cleanedContent.replace(splitPattern, '$1\n$2: ');

  const lines = normalizedContent.split('\n');
  let currentLabel: string | null = null;
  let currentValue: string[] = [];

  for (const line of lines) {
    const match = line.match(labelPattern);

    if (match) {
      if (currentLabel && currentValue.length > 0) {
        data[currentLabel.toLowerCase()] = currentValue.join('\n').trim();
      }

      currentLabel = match[1].toUpperCase();
      const valueAfterLabel = line.substring(match[0].length).trim();
      currentValue = valueAfterLabel ? [valueAfterLabel] : [];
    } else if (currentLabel) {
      // An attribution line is NOT part of the field. The templates render no
      // source field at all, so a trailing "— Herbert Kickl, ORF-Interview,
      // 3.3.2026" used to be swallowed INTO the quote and shipped as if the
      // graphic cited a real source. Dropping it here is the last line of
      // defense behind the prompt rules.
      if (isAttributionLine(line)) continue;
      currentValue.push(line);
    }
  }

  if (currentLabel && currentValue.length > 0) {
    data[currentLabel.toLowerCase()] = currentValue.join('\n').trim();
  }

  // Only check required fields (expectedFields), not optional ones
  const requiredFields = expectedFields.filter((f) => !optionalFields.includes(f.toLowerCase()));
  const missingFields = requiredFields.filter((field) => {
    const value = data[field.toLowerCase()];
    return !value || value.trim() === '';
  });

  if (missingFields.length > 0) {
    log.debug(`[textParser] Missing fields: ${missingFields.join(', ')}`);
    return {
      success: false,
      data,
      error: `Missing required fields: ${missingFields.join(', ')}`,
    };
  }

  log.debug(`[textParser] Successfully parsed ${Object.keys(data).length} fields`);
  return { success: true, data };
}

/**
 * Parse multiple labeled text variants from a single AI response.
 *
 * Expected format:
 * VARIANTE1
 * LABEL1: value1
 * LABEL2: value2
 *
 * VARIANTE2
 * LABEL1: value1
 * LABEL2: value2
 *
 * @param content - Raw AI response with multiple variants
 * @param expectedFields - Array of field names to extract (lowercase)
 * @param count - Expected number of variants
 * @param optionalFields - Array of field names that are optional (lowercase)
 * @returns Array of ParseResult objects
 */
export function parseLabeledTextBatch(
  content: string | null | undefined,
  expectedFields: string[],
  count: number,
  optionalFields: string[] = []
): ParseResult[] {
  if (!content || typeof content !== 'string') {
    log.warn('[textParser] Batch parse failed: empty or invalid content');
    return [];
  }

  const cleaned = content.replace(/```[\s\S]*?```/g, '').trim();

  if (!cleaned) {
    log.warn('[textParser] Batch parse failed: content empty after cleanup');
    return [];
  }

  const variantPattern = /(?:VARIANTE|VARIANT|SLIDE)\s*\d+/gi;
  const variants = cleaned.split(variantPattern).filter((s) => s.trim());

  if (variants.length === 0) {
    log.warn('[textParser] No variants found in content');
    return [];
  }

  const results: ParseResult[] = [];

  for (let i = 0; i < Math.min(variants.length, count); i++) {
    const parsed = parseLabeledText(variants[i], expectedFields, optionalFields);
    if (parsed.success) {
      results.push(parsed);
      log.debug(`[textParser] Batch variant ${i + 1} parsed successfully`);
    } else {
      log.warn(`[textParser] Batch variant ${i + 1} parse failed: ${parsed.error}`);
    }
  }

  log.info(`[textParser] Batch parse complete: ${results.length}/${count} variants parsed`);
  return results;
}

/**
 * Sanitize a field value by removing markdown and normalizing whitespace
 */
export function sanitizeField(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return '';

  return value
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,2}/g, '')
    .replace(/#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate a string to max length, trimming at word boundary if possible
 */
export function truncateField(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const truncated = value.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace).trim();
  }

  return truncated.trim();
}

/**
 * Truncate a string at a sentence boundary so it never ends mid-sentence.
 * Prefers the last sentence-ending punctuation (`.`/`!`/`?`) within `maxLength`;
 * falls back to word-boundary {@link truncateField} when no sentence break fits.
 */
export function truncateAtSentence(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const window = value.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    window.lastIndexOf('.'),
    window.lastIndexOf('!'),
    window.lastIndexOf('?')
  );

  // Only accept a sentence break that keeps a reasonable amount of text.
  if (lastSentenceEnd > maxLength * 0.5) {
    return window.substring(0, lastSentenceEnd + 1).trim();
  }

  return truncateField(value, maxLength);
}
