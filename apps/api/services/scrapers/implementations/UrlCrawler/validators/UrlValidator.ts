/**
 * URL Validator
 * Validates and sanitizes URLs for crawling
 */

import { URL } from 'url';
import type { ValidationResult } from '../types.js';

const MAX_URL_LENGTH = 8192;
const MAX_SANITIZATION_ITERATIONS = 20;

function countChar(str: string, char: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) count++;
  }
  return count;
}

export class UrlValidator {
  /**
   * Validates if a URL is valid and accessible
   */
  static async validateUrl(url: string): Promise<ValidationResult> {
    if (!url || url.length > MAX_URL_LENGTH) {
      return { isValid: false, error: 'URL is empty or too long' };
    }

    try {
      const urlObj = new URL(url);

      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          isValid: false,
          error: 'Only HTTP and HTTPS protocols are supported',
        };
      }

      if (process.env.NODE_ENV === 'production') {
        const hostname = urlObj.hostname.toLowerCase();
        if (
          hostname === 'localhost' ||
          hostname.startsWith('127.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('172.')
        ) {
          return {
            isValid: false,
            error: 'Local and private network URLs are not allowed',
          };
        }
      }

      return { isValid: true };
    } catch {
      return {
        isValid: false,
        error: 'Invalid URL format',
      };
    }
  }

  /**
   * Sanitizes a URL by removing common extraction artifacts
   * Handles cases where URLs are extracted from text with surrounding punctuation
   */
  static sanitizeUrl(url: string): string {
    if (!url) return url;

    if (url.length > MAX_URL_LENGTH) {
      return url.slice(0, MAX_URL_LENGTH);
    }

    let sanitized = url.trim();
    const originalUrl = sanitized;
    const trailingPunctuation = ['}', ',', ';', ':', "'", '"'];

    let iterations = 0;
    let changed = true;
    while (changed && iterations < MAX_SANITIZATION_ITERATIONS) {
      changed = false;
      iterations++;

      const openParens = countChar(sanitized, '(');
      const closeParens = countChar(sanitized, ')');

      if (closeParens > openParens && sanitized.endsWith(')')) {
        sanitized = sanitized.slice(0, -1);
        changed = true;
        continue;
      }

      const openBrackets = countChar(sanitized, '[');
      const closeBrackets = countChar(sanitized, ']');

      if (closeBrackets > openBrackets && sanitized.endsWith(']')) {
        sanitized = sanitized.slice(0, -1);
        changed = true;
        continue;
      }

      for (const punct of trailingPunctuation) {
        if (sanitized.endsWith(punct)) {
          sanitized = sanitized.slice(0, -1);
          changed = true;
          break;
        }
      }
    }

    if (sanitized !== originalUrl) {
      console.log(`[UrlValidator] Sanitized URL: "${originalUrl}" -> "${sanitized}"`);
    }

    return sanitized;
  }
}
