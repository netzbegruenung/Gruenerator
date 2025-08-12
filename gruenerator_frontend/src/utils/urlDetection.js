/**
 * URL Detection and Processing Utilities
 * Provides functions for detecting, validating, and processing URLs in text content
 */

// Enhanced regex for detecting URLs in text - supports various URL formats
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * Detects URLs in text content
 * @param {string} text - Text to scan for URLs
 * @returns {Array<string>} Array of detected URLs
 */
export const detectUrls = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : []; // Remove duplicates
};

/**
 * Extracts new URLs that aren't already processed
 * @param {string} text - Current text content
 * @param {Array<string>} processedUrls - Already processed URLs
 * @returns {Array<string>} New URLs to process
 */
export const getNewUrls = (text, processedUrls = []) => {
  const allUrls = detectUrls(text);
  return allUrls.filter(url => !processedUrls.includes(url));
};

/**
 * Creates a display-friendly title from URL
 * @param {string} url - URL to create title from
 * @returns {string} Display title
 */
export const getUrlDisplayTitle = (url) => {
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
export const getUrlDomain = (url) => {
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
export const isValidUrl = (url) => {
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
export const sanitizeUrlForDisplay = (url) => {
  try {
    const urlObj = new URL(url);
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid'
    ];
    
    trackingParams.forEach(param => {
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
export const countUrls = (text) => {
  return detectUrls(text).length;
};

/**
 * Gets a preview text that highlights URLs
 * @param {string} text - Original text
 * @param {number} maxLength - Maximum length for preview
 * @returns {string} Preview text with URL indicators
 */
export const getTextPreviewWithUrls = (text, maxLength = 150) => {
  if (!text) return '';
  
  const urls = detectUrls(text);
  let preview = text;
  
  // Replace URLs with [URL] markers for preview
  urls.forEach(url => {
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
 * @returns {Array<Object>} Array of URL objects with context
 */
export const extractUrlsWithContext = (text, contextLength = 50) => {
  if (!text) return [];
  
  const urls = detectUrls(text);
  
  return urls.map(url => {
    const index = text.indexOf(url);
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + url.length + contextLength);
    
    return {
      url,
      domain: getUrlDomain(url),
      context: text.substring(start, end),
      position: index
    };
  });
};

/**
 * Debounced URL detection for performance
 * @param {string} text - Text to analyze
 * @param {Function} callback - Callback to execute with detected URLs
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} Cleanup function
 */
export const createDebouncedUrlDetection = (callback, delay = 1000) => {
  let timeoutId = null;
  let lastUrls = [];
  
  return (text) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      const currentUrls = detectUrls(text);
      const newUrls = currentUrls.filter(url => !lastUrls.includes(url));
      
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
  SKIPPED: 'skipped'
};

/**
 * URL type detection based on domain patterns
 * @param {string} url - URL to analyze
 * @returns {string} Detected URL type
 */
export const detectUrlType = (url) => {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    const path = urlObj.pathname.toLowerCase();
    
    // News sites
    if (domain.includes('news') || 
        domain.includes('zeit') || 
        domain.includes('spiegel') || 
        domain.includes('tagesschau') ||
        domain.includes('faz') ||
        domain.includes('sueddeutsche')) {
      return 'news';
    }
    
    // Social media
    if (domain.includes('twitter') || 
        domain.includes('facebook') || 
        domain.includes('instagram') ||
        domain.includes('linkedin')) {
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