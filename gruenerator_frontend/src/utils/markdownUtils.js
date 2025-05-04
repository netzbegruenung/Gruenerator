import TurndownService from 'turndown';

// Initialize TurndownService once when the module is loaded
const turndownService = new TurndownService();

/**
 * Converts an HTML string to Markdown using a shared Turndown instance.
 * @param {string} html - The HTML string to convert.
 * @returns {string} The converted Markdown string.
 * @throws {Error} Throws an error if conversion fails.
 */
export const convertHtmlToMarkdown = (html) => {
  if (typeof html !== 'string') {
    console.warn('[markdownUtils] Input is not a string, returning empty string.');
    return '';
  }
  try {
    return turndownService.turndown(html);
  } catch (error) {
    console.error('[markdownUtils] Error converting HTML to Markdown:', error);
    // Re-throw the error to be handled by the caller
    throw new Error('Fehler bei der Konvertierung von HTML zu Markdown.');
  }
}; 