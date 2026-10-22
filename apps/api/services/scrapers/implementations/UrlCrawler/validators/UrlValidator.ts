/**
 * URL Validator
 * Validates and sanitizes URLs for crawling.
 * Includes robots.txt checking to respect publisher crawl policies.
 */

import { createRequire } from 'module';
import { URL } from 'url';

import {
  isUrlValidationError,
  safeFetch,
  validateUrlForFetch,
} from '../../../../../utils/validation/urlSecurity.js';

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

/**
 * `refused` is safeFetch refusing the robots.txt request itself — a redirect
 * hop or a resolved address it will not go to. That is not "there is no
 * robots.txt" and must not read as permission to crawl the host.
 */
type RobotsVerdict = 'allowed' | 'disallowed' | 'refused';

function verdictOf(checker: RobotsChecker | null, url: string): RobotsVerdict {
  return !checker || (checker.isAllowed(url, BOT_USER_AGENT) ?? true) ? 'allowed' : 'disallowed';
}

async function checkRobotsTxt(url: string): Promise<RobotsVerdict> {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;

    const cached = robotsCache.get(origin);
    if (cached && cached.expiry > Date.now()) {
      return verdictOf(cached.checker, url);
    }

    const robotsUrl = `${origin}/robots.txt`;
    const resp = await safeFetch(robotsUrl, {
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

    return verdictOf(checker, url);
  } catch (error) {
    // Missing, unreachable or slow robots.txt: allowed, as it always was.
    return isUrlValidationError(error) ? 'refused' : 'allowed';
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
  /**
   * Validate a URL for crawling.
   *
   * Set `checkRobots: false` for user-initiated single-link actions (e.g. a
   * user pasting their own Canva template link to save it). That is not bulk
   * crawling, so robots.txt must not block it — Canva, for instance, disallows
   * `/design/` outright. Format and SSRF/private-network checks always run.
   */
  static async validateUrl(
    url: string,
    options: { checkRobots?: boolean } = {}
  ): Promise<ValidationResult> {
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

      // The shared SSRF check, in every environment: blocked host names, the
      // full private/link-local range list, and every DNS record of the host.
      // It is the early, readable rejection — the crawlers check the address
      // again when they connect, and do not follow redirects unchecked.
      const urlCheck = await validateUrlForFetch(url);
      if (!urlCheck.isValid) {
        return { isValid: false, error: urlCheck.error ?? 'URL is not allowed' };
      }

      if (options.checkRobots !== false) {
        const verdict = await checkRobotsTxt(url);
        if (verdict === 'refused') {
          return { isValid: false, error: 'URL leads to an address that is not allowed' };
        }
        if (verdict === 'disallowed') {
          return {
            isValid: false,
            error: 'Diese URL erlaubt kein automatisches Lesen (robots.txt).',
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
