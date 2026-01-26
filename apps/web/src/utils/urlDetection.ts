/**
 * URL Detection and Processing Utilities
 * Provides functions for detecting, validating, and processing URLs in text content
 */

// Enhanced regex for detecting URLs in text - supports various URL formats
const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

/** URL with context information */
export interface UrlWithContext {
  url: string;
  domain: string;
  context: string;
  position: number;
}

/** Callback type for debounced URL detection */
export type UrlDetectionCallback = (newUrls: string[], allUrls: string[]) => void;

/** URL type categories */
export type UrlType = 'news' | 'social' | 'pdf' | 'image' | 'government' | 'webpage' | 'unknown';

/**
 * Sanitizes a URL by removing unbalanced trailing punctuation
 * Handles cases where URLs are extracted from text with surrounding parentheses,
 * e.g., "Check this (https://example.com/page.html)" captures trailing ")"
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
const sanitizeExtractedUrl = (url: string): string => {
  if (!url) return url;

  let sanitized = url;

  // Loop until no more changes - handles mixed cases like "url),"
  let changed = true;
  while (changed) {
    changed = false;

    // Handle unbalanced parentheses - keep balanced ones (e.g., Wikipedia URLs)
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

    // Strip other common trailing punctuation from text extraction
    // Include period only if preceded by closing paren/bracket (sentence ending after link)
    const stripped = sanitized.replace(/[},;:'"]+$/, '');
    if (stripped !== sanitized) {
      sanitized = stripped;
      changed = true;
      continue;
    }

    // Handle trailing period after closing paren like "url)."
    if (
      sanitized.match(/[)\]]\.$/) &&
      !sanitized.match(/\.(html?|php|aspx?|jsp|pdf|doc|txt)\.$/i)
    ) {
      sanitized = sanitized.slice(0, -1);
      changed = true;
    }
  }

  return sanitized;
};

/**
 * Detects URLs in text content
 * @param {string} text - Text to scan for URLs
 * @returns {Array<string>} Array of detected URLs
 */
export const detectUrls = (text: string): string[] => {
  if (!text || typeof text !== 'string') return [];

  const matches = text.match(URL_REGEX);
  if (!matches) return [];

  // Sanitize each URL to remove unbalanced trailing punctuation
  const sanitizedUrls = matches.map(sanitizeExtractedUrl);

  return [...new Set(sanitizedUrls)]; // Remove duplicates
};

/**
 * Extracts new URLs that aren't already processed
 * @param {string} text - Current text content
 * @param {Array<string>} processedUrls - Already processed URLs
 * @returns {Array<string>} New URLs to process
 */
export const getNewUrls = (text: string, processedUrls: string[] = []): string[] => {
  const allUrls = detectUrls(text);
  return allUrls.filter((url) => !processedUrls.includes(url));
};

/**
 * Creates a display-friendly title from URL
 * @param {string} url - URL to create title from
 * @returns {string} Display title
 */
export const getUrlDisplayTitle = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '');
    return `Content from ${domain}`;
  } catch {
    return 'Crawled Content';
  }
};

/**
 * Gets the domain from a URL for display purposes
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name
 */
export const getUrlDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
};

/**
 * Validates if a string looks like a valid URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if the URL format is valid
 */
export const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

/**
 * Sanitizes URL for display (removes sensitive parameters)
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
export const sanitizeUrlForDisplay = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'msclkid',
      '_ga',
      'mc_eid',
    ];

    trackingParams.forEach((param) => {
      urlObj.searchParams.delete(param);
    });

    return urlObj.toString();
  } catch {
    return url;
  }
};

/**
 * Counts URLs in text
 * @param {string} text - Text to count URLs in
 * @returns {number} Number of URLs found
 */
export const countUrls = (text: string): number => {
  return detectUrls(text).length;
};

/**
 * Gets a preview text that highlights URLs
 * @param {string} text - Original text
 * @param {number} maxLength - Maximum length for preview
 * @returns {string} Preview text with URL indicators
 */
export const getTextPreviewWithUrls = (text: string, maxLength: number = 150): string => {
  if (!text) return '';

  const urls = detectUrls(text);
  let preview = text;

  // Replace URLs with [URL] markers for preview
  urls.forEach((url) => {
    const domain = getUrlDomain(url);
    preview = preview.replace(url, `[Link: ${domain}]`);
  });

  if (preview.length > maxLength) {
    return preview.substring(0, maxLength - 3) + '...';
  }

  return preview;
};

/**
 * Extracts URLs and surrounding context
 * @param {string} text - Text to extract from
 * @param {number} contextLength - Characters of context around each URL
 * @returns {Array<UrlWithContext>} Array of URL objects with context
 */
export const extractUrlsWithContext = (
  text: string,
  contextLength: number = 50
): UrlWithContext[] => {
  if (!text) return [];

  const urls = detectUrls(text);

  return urls.map((url) => {
    const index = text.indexOf(url);
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + url.length + contextLength);

    return {
      url,
      domain: getUrlDomain(url),
      context: text.substring(start, end),
      position: index,
    };
  });
};

/**
 * Debounced URL detection for performance
 * @param {UrlDetectionCallback} callback - Callback to execute with detected URLs
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} Function that accepts text and returns a cleanup function
 */
export const createDebouncedUrlDetection = (
  callback: UrlDetectionCallback,
  delay: number = 1000
): ((text: string) => () => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastUrls: string[] = [];

  return (text: string): (() => void) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      const currentUrls = detectUrls(text);
      const newUrls = currentUrls.filter((url) => !lastUrls.includes(url));

      if (newUrls.length > 0) {
        callback(newUrls, currentUrls);
        lastUrls = currentUrls;
      }
    }, delay);

    // Return cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  };
};

/**
 * URL status constants for UI feedback
 */
export const URL_STATUS = {
  DETECTED: 'detected',
  CRAWLING: 'crawling',
  CRAWLED: 'crawled',
  ERROR: 'error',
  SKIPPED: 'skipped',
};

/**
 * URL type detection based on domain patterns
 * @param {string} url - URL to analyze
 * @returns {UrlType} Detected URL type
 */
export const detectUrlType = (url: string): UrlType => {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    const path = urlObj.pathname.toLowerCase();

    // News sites
    if (
      domain.includes('news') ||
      domain.includes('zeit') ||
      domain.includes('spiegel') ||
      domain.includes('tagesschau') ||
      domain.includes('faz') ||
      domain.includes('sueddeutsche')
    ) {
      return 'news';
    }

    // Social media
    if (
      domain.includes('twitter') ||
      domain.includes('facebook') ||
      domain.includes('instagram') ||
      domain.includes('linkedin')
    ) {
      return 'social';
    }

    // PDFs
    if (path.endsWith('.pdf')) {
      return 'pdf';
    }

    // Images
    if (path.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return 'image';
    }

    // Government sites
    if (domain.endsWith('.gov') || domain.endsWith('.gov.de')) {
      return 'government';
    }

    return 'webpage';
  } catch {
    return 'unknown';
  }
};
