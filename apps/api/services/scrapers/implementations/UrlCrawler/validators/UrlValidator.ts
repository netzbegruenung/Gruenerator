/**
 * URL Validator
 * Validates and sanitizes URLs for crawling.
 * Includes robots.txt checking to respect publisher crawl policies.
 */

import { URL } from 'url';

import robotsParser from 'robots-parser';

import type { ValidationResult } from '../types.js';

const MAX_URL_LENGTH = 8192;
const MAX_SANITIZATION_ITERATIONS = 20;
const ROBOTS_CACHE_TTL = 60 * 60 * 1000;
const ROBOTS_FETCH_TIMEOUT = 3000;
const BOT_USER_AGENT = 'Gruenerator/1.0';

const robotsCache = new Map<string, { allowed: boolean; expiry: number }>();

async function isAllowedByRobotsTxt(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;

    const cached = robotsCache.get(origin);
    if (cached && cached.expiry > Date.now()) {
      return cached.allowed;
    }

    const robotsUrl = `${origin}/robots.txt`;
    const resp = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(ROBOTS_FETCH_TIMEOUT),
      headers: { 'User-Agent': BOT_USER_AGENT },
    });

    let allowed = true;
    if (resp.ok) {
      const text = await resp.text();
      const robots = robotsParser(robotsUrl, text);
      allowed = robots.isAllowed(url, BOT_USER_AGENT) ?? true;
    }

    robotsCache.set(origin, { allowed, expiry: Date.now() + ROBOTS_CACHE_TTL });

    // Clean old entries periodically
    if (robotsCache.size > 200) {
      const now = Date.now();
      for (const [key, val] of robotsCache) {
        if (val.expiry < now) robotsCache.delete(key);
      }
    }

    return allowed;
  } catch {
    return true;
  }
}

function countChar(str: string, char: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) count++;
  }
  return count;
}

export class UrlValidator {
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

      const allowed = await isAllowedByRobotsTxt(url);
      if (!allowed) {
        return {
          isValid: false,
          error: 'Diese URL erlaubt kein automatisches Lesen (robots.txt).',
        };
      }

      return { isValid: true };
    } catch {
      return {
        isValid: false,
        error: 'Invalid URL format',
      };
    }
  }

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
