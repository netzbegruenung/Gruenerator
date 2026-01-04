import { createLogger } from '../logger.js';

const log = createLogger('sharepic-textParser');

export interface ParseResult {
  success: boolean;
  data: Record<string, string>;
  error?: string;
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
 * @returns ParseResult with success status and extracted data
 */
export function parseLabeledText(content: string | null | undefined, expectedFields: string[]): ParseResult {
  if (!content || typeof content !== 'string') {
    return { success: false, data: {}, error: 'Empty or invalid content' };
  }

  const cleanedContent = content
    .replace(/```(?:json|text|)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  if (!cleanedContent) {
    return { success: false, data: {}, error: 'Content empty after cleanup' };
  }

  const data: Record<string, string> = {};
  const upperFields = expectedFields.map(f => f.toUpperCase());
  const labelPattern = new RegExp(`^(${upperFields.join('|')}):\\s*`, 'i');

  const lines = cleanedContent.split('\n');
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
      currentValue.push(line);
    }
  }

  if (currentLabel && currentValue.length > 0) {
    data[currentLabel.toLowerCase()] = currentValue.join('\n').trim();
  }

  const missingFields = expectedFields.filter(field => {
    const value = data[field.toLowerCase()];
    return !value || value.trim() === '';
  });

  if (missingFields.length > 0) {
    log.debug(`[textParser] Missing fields: ${missingFields.join(', ')}`);
    return {
      success: false,
      data,
      error: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  log.debug(`[textParser] Successfully parsed ${Object.keys(data).length} fields`);
  return { success: true, data };
}

/**
 * Sanitize a field value by removing markdown and normalizing whitespace
 */
export function sanitizeField(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return '';

  return value
    .replace(/\*\*/g, '')
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
