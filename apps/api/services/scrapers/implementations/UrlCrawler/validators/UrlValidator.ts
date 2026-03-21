/**
 * URL Validator
 * Validates and sanitizes URLs for crawling.
 * Includes robots.txt checking to respect publisher crawl policies.
 */

import { createRequire } from 'module';
import { URL } from 'url';

const require = createRequire(import.meta.url);
const robotsParser = require('robots-parser') as (
  url: string,
  content: string
) => { isAllowed(url: string, ua?: string): boolean | undefined };

import type { ValidationResult } from '../types.js';

const MAX_URL_LENGTH = 8192;
const MAX_SANITIZATION_ITERATIONS = 20;
const ROBOTS_CACHE_TTL = 60 * 60 * 1000;
const ROBOTS_FETCH_TIMEOUT = 3000;
const BOT_USER_AGENT = 'Gruenerator/1.0';

type RobotsChecker = { isAllowed(url: string, ua?: string): boolean | undefined };
const robotsCache = new Map<string, { checker: RobotsChecker | null; expiry: number }>();

async function isAllowedByRobotsTxt(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;

    const cached = robotsCache.get(origin);
    if (cached && cached.expiry > Date.now()) {
      return cached.checker ? (cached.checker.isAllowed(url, BOT_USER_AGENT) ?? true) : true;
    }

    const robotsUrl = `${origin}/robots.txt`;
    const resp = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(ROBOTS_FETCH_TIMEOUT),
      headers: { 'User-Agent': BOT_USER_AGENT },
    });

    let checker: RobotsChecker | null = null;
    if (resp.ok) {
      const text = await resp.text();
      checker = robotsParser(robotsUrl, text);
    }

    robotsCache.set(origin, { checker, expiry: Date.now() + ROBOTS_CACHE_TTL });

    // Clean old entries periodically
    if (robotsCache.size > 200) {
      const now = Date.now();
      for (const [key, val] of robotsCache) {
        if (val.expiry < now) robotsCache.delete(key);
      }
    }

    return checker ? (checker.isAllowed(url, BOT_USER_AGENT) ?? true) : true;
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
