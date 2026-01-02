/**
 * URL validation utilities for the application
 */

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates if a URL is properly formatted and uses allowed protocols
 * @param url - The URL to validate
 * @returns Validation result
 */
export const validateUrl = (url: string | null | undefined): ValidationResult => {
  if (!url || !url.trim()) {
    return {
      isValid: false,
      error: 'URL ist erforderlich.'
    };
  }
  
  try {
    const urlObj = new URL(url.trim());
    
    // Check for supported protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return {
        isValid: false,
        error: 'Nur HTTP und HTTPS URLs sind erlaubt.'
      };
    }

    // Check for localhost or private IP addresses in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'localhost' || 
          hostname.startsWith('127.') || 
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('172.')) {
        return {
          isValid: false,
          error: 'Lokale und private Netzwerk-URLs sind nicht erlaubt.'
        };
      }
    }

    // Check for suspicious or blocked domains (can be extended)
    const blockedDomains = ['example.com', 'test.com'];
    if (blockedDomains.includes(urlObj.hostname.toLowerCase())) {
      return {
        isValid: false,
        error: 'Diese Domain ist nicht erlaubt.'
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: 'Ungültige URL. Bitte überprüfen Sie das Format.'
    };
  }
};

/**
 * Normalizes a URL by trimming whitespace and ensuring proper format
 * @param url - The URL to normalize
 * @returns Normalized URL
 */
export const normalizeUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  
  let normalized = url.trim();
  
  // Add https:// if no protocol is specified
  if (normalized && !normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }
  
  return normalized;
};

/**
 * Extracts domain name from URL for display purposes
 * @param url - The URL to extract domain from
 * @returns Domain name or empty string if invalid
 */
export const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '';
  }
};

/**
 * Checks if a URL appears to be a PDF link based on the path
 * @param url - The URL to check
 * @returns True if URL appears to point to a PDF
 */
export const isPdfUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.toLowerCase().endsWith('.pdf');
  } catch (error) {
    return false;
  }
};

/**
 * Generates a suggested title from a URL
 * @param url - The URL to generate title from
 * @returns Suggested title
 */
export const generateTitleFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '');
    const pathParts = urlObj.pathname.split('/').filter(part => part);
    
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      // Remove file extensions and convert dashes/underscores to spaces
      const cleaned = lastPart
        .replace(/\.[^.]*$/, '') // Remove file extension
        .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
      
      if (cleaned.length > 3) {
        return `${cleaned} - ${domain}`;
      }
    }
    
    return `Content from ${domain}`;
  } catch (error) {
    return 'Crawled Content';
  }
};