/**
 * Markdown conversion service for Grünerator backend
 * Handles all markdown to HTML/plain text conversions
 */

const marked = require('marked');

// Configure marked with consistent settings
marked.setOptions({
  breaks: true,      // Convert line breaks to <br>
  gfm: true,        // GitHub Flavored Markdown
  headerIds: false, // Don't add IDs to headers
  mangle: false     // Don't mangle autolinks
});

/**
 * Convert markdown to HTML
 * @param {string} markdown - Raw markdown content
 * @returns {string} HTML content
 */
function markdownToHtml(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }
  
  try {
    return marked.parse(markdown);
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
    // Return original content on error
    return markdown;
  }
}

/**
 * Convert markdown to plain text (strips HTML)
 * @param {string} markdown - Raw markdown content
 * @returns {string} Plain text content
 */
function markdownToPlainText(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }
  
  try {
    const html = marked.parse(markdown);
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .trim();
  } catch (error) {
    console.error('Error converting markdown to plain text:', error);
    // Return original content on error
    return markdown;
  }
}

/**
 * Convert markdown for export formatting (preserves some structure)
 * @param {string} markdown - Raw markdown content
 * @returns {string} HTML content optimized for export
 */
function markdownForExport(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }
  
  try {
    const html = marked.parse(markdown);
    
    // Additional formatting for exports
    return html
      .replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, '<h$1>$2</h$1>') // Clean headers
      .replace(/<p>\s*<\/p>/gi, '') // Remove empty paragraphs
      .trim();
  } catch (error) {
    console.error('Error converting markdown for export:', error);
    // Return original content on error
    return markdown;
  }
}

/**
 * Check if content contains markdown syntax
 * @param {string} content - Content to check
 * @returns {boolean} True if content appears to be markdown
 */
function isMarkdownContent(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // Headers
    /\*\*[^*]+\*\*/,         // Bold
    /\*[^*]+\*/,             // Italic
    /\[[^\]]+\]\([^)]+\)/,   // Links
    /^[-*+]\s+/m,            // Lists
    /^>\s+/m,                // Blockquotes
    /`[^`]+`/,               // Inline code
    /^```/m                  // Code blocks
  ];
  
  return markdownPatterns.some(pattern => pattern.test(content));
}

module.exports = {
  markdownToHtml,
  markdownToPlainText,
  markdownForExport,
  isMarkdownContent
};