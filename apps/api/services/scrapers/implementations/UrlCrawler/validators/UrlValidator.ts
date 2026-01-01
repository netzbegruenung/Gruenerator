/**
 * URL Validator
 * Validates and sanitizes URLs for crawling
 */

import { URL } from 'url';
import type { ValidationResult } from '../types.js';

export class UrlValidator {
  /**
   * Validates if a URL is valid and accessible
   */
  static async validateUrl(url: string): Promise<ValidationResult> {
    try {
      const urlObj = new URL(url);

      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          isValid: false,
          error: 'Only HTTP and HTTPS protocols are supported',
        };
      }

      // Check for localhost or private IP addresses in production
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
    } catch (error) {
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

    let sanitized = url.trim();
    const originalUrl = sanitized;

    // Loop until no more changes - handles mixed cases like "url),"
    let changed = true;
    while (changed) {
      changed = false;
      const beforeLoop = sanitized;

      // Handle unbalanced parentheses - Wikipedia URLs legitimately use balanced parens
      const openParens = (sanitized.match(/\(/g) || []).length;
      const closeParens = (sanitized.match(/\)/g) || []).length;

      if (closeParens > openParens && sanitized.endsWith(')')) {
        sanitized = sanitized.slice(0, -1);
        changed = true;
        continue;
      }

      // Handle unbalanced square brackets
      const openBrackets = (sanitized.match(/\[/g) || []).length;
      const closeBrackets = (sanitized.match(/\]/g) || []).length;

      if (closeBrackets > openBrackets && sanitized.endsWith(']')) {
        sanitized = sanitized.slice(0, -1);
        changed = true;
        continue;
      }

      // Strip other trailing punctuation
      const stripped = sanitized.replace(/[},;:'"]+$/, '');
      if (stripped !== sanitized) {
        sanitized = stripped;
        changed = true;
      }
    }

    // Log if sanitization changed the URL
    if (sanitized !== originalUrl) {
      console.log(`[UrlValidator] Sanitized URL: "${originalUrl}" -> "${sanitized}"`);
    }

    return sanitized;
  }
}
