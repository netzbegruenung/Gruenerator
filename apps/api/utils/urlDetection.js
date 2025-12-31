/**
 * Backend URL Detection Utilities
 * Port of frontend urlDetection.js functionality for server-side use
 * Detects and extracts URLs from text content for automatic crawling
 */

// Enhanced regex for detecting URLs in text - same as frontend
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * Detects URLs in text content
 * @param {string} text - Text to scan for URLs
 * @returns {Array<string>} Array of detected URLs
 */
const detectUrls = (text) => {
  if (!text || typeof text !== 'string') return [];

  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : []; // Remove duplicates
};

/**
 * Extracts URLs from request content fields
 * @param {Object} request - Request object containing text fields
 * @returns {Array<string>} Array of unique URLs found in all fields
 */
const extractUrlsFromContent = (request) => {
  if (!request || typeof request !== 'object') return [];

  const allUrls = new Set();

  // Define fields to scan for URLs
  const fieldsToScan = [
    'thema', 'theme', 'details', 'customPrompt', 'instructions',
    'was', 'wie', 'zitatgeber', 'schwerpunkte', 'rolle'
  ];

  // Scan each field for URLs
  fieldsToScan.forEach(field => {
    if (request[field]) {
      const urls = detectUrls(String(request[field]));
      urls.forEach(url => allUrls.add(url));
    }
  });

  // Handle string requests (for universal generator)
  if (typeof request === 'string') {
    const urls = detectUrls(request);
    urls.forEach(url => allUrls.add(url));
  }

  return Array.from(allUrls);
};

/**
 * Validates if a string looks like a valid URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if the URL format is valid
 */
const isValidUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

/**
 * Gets the domain from a URL for display purposes
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name
 */
const getUrlDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
};

/**
 * Checks if URLs are already present in existing attachments/documents
 * @param {Array<string>} urls - URLs to check
 * @param {Array} existingAttachments - Existing attachments to compare against
 * @returns {Array<string>} URLs that are not already in attachments
 */
const filterNewUrls = (urls, existingAttachments = []) => {
  if (!Array.isArray(existingAttachments) || existingAttachments.length === 0) {
    return urls;
  }

  const existingUrls = new Set();
  existingAttachments.forEach(att => {
    if (att.url) existingUrls.add(att.url);
    if (att.type === 'crawled_url' && att.url) existingUrls.add(att.url);
  });

  return urls.filter(url => !existingUrls.has(url));
};

module.exports = {
  detectUrls,
  extractUrlsFromContent,
  isValidUrl,
  getUrlDomain,
  filterNewUrls,
  URL_REGEX
};