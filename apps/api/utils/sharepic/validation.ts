import type { Slogan } from './parsing.js';

export interface InfoData {
  header: string;
  subheader: string;
  body: string;
}

/**
 * Check if slogan has all required lines
 */
export function isSloganValid(slogan: Slogan): boolean {
  return Boolean(slogan.line1 && slogan.line2 && slogan.line3);
}

/**
 * Check if info post is valid (character limits)
 * Uses slightly relaxed ranges for better success rate: ±5 characters tolerance
 */
export function isInfoValid(info: InfoData): boolean {
  if (!info.header || !info.subheader || !info.body) {
    return false;
  }

  const headerLength = info.header.length;
  const subheaderLength = info.subheader.length;
  const bodyLength = info.body.length;

  return headerLength >= 45 && headerLength <= 65 &&
         subheaderLength >= 75 && subheaderLength <= 125 &&
         bodyLength >= 145 && bodyLength <= 255;
}

/**
 * Detect if an error is related to throttling/temporary issues
 */
export function isThrottlingError(error: string | null | undefined): boolean {
  if (!error || typeof error !== 'string') return false;
  const errorLower = error.toLowerCase();
  return errorLower.includes('throttl') ||
         errorLower.includes('rate limit') ||
         errorLower.includes('capacity') ||
         errorLower.includes('too many requests') ||
         errorLower.includes('service unavailable');
}

/**
 * Sanitize info field by removing markdown and normalizing whitespace
 */
export function sanitizeInfoField(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return value
    .replace(/\*\*/g, '')
    .replace(/#\w+/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
