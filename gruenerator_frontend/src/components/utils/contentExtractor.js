/**
 * Centralized content extraction utility for the Grünerator application.
 * Handles various content types and output formats to reduce code duplication.
 * 
 * Note: For search exports with complex formatting requirements, the existing
 * formatExportContent from exportUtils.jsx is used to maintain specific functionality.
 */

import { formatExportContent } from './exportUtils';
import { isMarkdownContent } from '../common/Form/utils/contentUtils';
import apiClient from './apiClient';

/**
 * Converts HTML string to plain text while preserving basic structure
 * @param {string} html - HTML content to convert
 * @returns {string} Plain text with preserved structure
 */
export const convertHtmlToPlainText = async (html) => {
  if (!html) return '';
  
  // Convert markdown to HTML first if needed using backend service
  if (typeof html === 'string' && isMarkdownContent(html)) {
    try {
      const response = await apiClient.post('/markdown/to-html', { content: html });
      if (response.data.success) {
        html = response.data.html;
      }
    } catch (error) {
      console.error('Error converting markdown to HTML:', error);
      // Continue with original content on error
    }
  }
  
  // Create temporary DOM element for parsing
  const tempElement = document.createElement('div');
  tempElement.innerHTML = html;
  
  // Add line breaks for block elements and list formatting
  const blockElements = tempElement.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote');
  blockElements.forEach(element => {
    element.insertAdjacentHTML('afterend', '\n');
    
    // Add bullet points for list items
    if (element.tagName === 'LI') {
      element.insertAdjacentHTML('beforebegin', '• ');
    }
  });

  // Add extra line breaks after lists for better readability
  const lists = tempElement.querySelectorAll('ul, ol');
  lists.forEach(list => {
    list.insertAdjacentHTML('afterend', '\n');
  });

  // Extract and clean the text
  const plainText = tempElement.innerText
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks to maximum two
    .replace(/•\s+/g, '• ') // Normalize bullet spacing
    .trim();

  return plainText;
};

/**
 * Extracts text content from mixed content objects (sharepic/social format)
 * @param {Object} mixedContent - Object with sharepic and/or social properties
 * @returns {string} Combined text content
 */
export const extractMixedContent = (mixedContent) => {
  if (!mixedContent || typeof mixedContent !== 'object') return '';
  
  const parts = [];
  
  if (mixedContent.sharepic) {
    // Extract content property if it's an object, otherwise use as-is
    const sharepicContent = typeof mixedContent.sharepic === 'object' 
      ? (mixedContent.sharepic.content || '')
      : mixedContent.sharepic;
    if (sharepicContent) parts.push(sharepicContent);
  }
  
  if (mixedContent.social) {
    // Extract content property if it's an object, otherwise use as-is
    const socialContent = typeof mixedContent.social === 'object'
      ? (mixedContent.social.content || '')
      : mixedContent.social;
    if (socialContent) parts.push(socialContent);
  }
  
  // Include fallback content if no parts were added
  if (parts.length === 0 && mixedContent.content) {
    parts.push(mixedContent.content);
  }
  
  return parts.join('\n\n');
};

/**
 * Extracts content from search export objects
 * @param {Object} searchExport - Object with analysis, sourceRecommendations, unusedSources
 * @param {boolean} includeMetadata - Whether to include source recommendations and unused sources
 * @returns {string} Formatted content
 */
export const extractSearchExportContent = (searchExport, includeMetadata = true) => {
  if (!searchExport || typeof searchExport !== 'object') return '';
  
  let content = '';
  
  // Main analysis content
  if (searchExport.analysis) {
    content = searchExport.analysis;
    
    // Clean HTML if present
    if (content.includes('<')) {
      content = convertHtmlToPlainText(content);
    }
  }
  
  if (!includeMetadata) return content;
  
  // Add source recommendations
  if (searchExport.sourceRecommendations?.length > 0) {
    content += '\n\nQuellenempfehlungen:';
    searchExport.sourceRecommendations.forEach(rec => {
      content += `\n• ${rec.title} - ${rec.summary}`;
    });
  }
  
  // Add unused sources
  if (searchExport.unusedSources?.length > 0) {
    content += '\n\nWeitere relevante Quellen:';
    searchExport.unusedSources.forEach(source => {
      content += `\n• ${source.title}`;
    });
  }
  
  return content.trim();
};

/**
 * Extracts plain text from any content type for clipboard copying
 * @param {string|Object} content - Content in any supported format
 * @returns {string} Clean plain text suitable for copying
 */
export const extractPlainText = async (content) => {
  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('extractPlainText input:', {
      type: typeof content,
      isObject: typeof content === 'object',
      hasSharepic: !!(content?.sharepic),
      hasSocial: !!(content?.social),
      hasAnalysis: !!(content?.analysis),
      objectKeys: typeof content === 'object' ? Object.keys(content) : null
    });
  }
  
  // Handle null/undefined
  if (!content) return '';
  
  // Handle plain strings
  if (typeof content === 'string') {
    // Convert markdown first if needed
    if (isMarkdownContent(content)) {
      const { marked } = await import('marked');
      content = marked(content, {
        breaks: true,      // Convert line breaks to <br>
        gfm: true,        // GitHub Flavored Markdown
        headerIds: false, // Don't add IDs to headers
        mangle: false     // Don't mangle autolinks
      });
    }
    
    // Check if it's HTML content (after potential markdown conversion)
    if (content.includes('<') && content.includes('>')) {
      return convertHtmlToPlainText(content);
    }
    return content.trim();
  }
  
  // Handle objects
  if (typeof content === 'object') {
    // Search export format
    if (content.analysis) {
      return extractSearchExportContent(content, true);
    }
    
    // Mixed content format (sharepic/social)
    if (content.sharepic || content.social) {
      const mixedText = extractMixedContent(content);
      return mixedText.includes('<') ? convertHtmlToPlainText(mixedText) : mixedText;
    }
  }
  
  // Handle unexpected object structures gracefully
  if (typeof content === 'object') {
    // Try common content properties
    if (content.content) return content.content.trim();
    if (content.text) return content.text.trim();
    if (content.value) return content.value.trim();
    
    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('Unknown content object structure:', Object.keys(content));
    }
    
    // Last resort: stringify for debugging
    return JSON.stringify(content);
  }

  // Fallback for non-object types
  return String(content).trim();
};

/**
 * Extracts formatted text for document exports (sends raw content to backend)
 * @param {string|Object} content - Content in any supported format
 * @returns {Promise<string>} Raw content for backend processing
 */
export const extractFormattedText = async (content) => {
  // For document exports, send raw content to backend - no frontend conversion
  // Backend will handle markdown/HTML conversion and formatting
  
  // Handle null/undefined
  if (!content) return '';
  
  // Handle plain strings - return as-is (markdown or HTML)
  if (typeof content === 'string') {
    return content.trim();
  }
  
  // Handle objects
  if (typeof content === 'object') {
    // Search export format
    if (content.analysis) {
      return extractSearchExportContent(content, true);
    }
    
    // Mixed content format (sharepic/social)
    if (content.sharepic || content.social) {
      return extractMixedContent(content);
    }
  }
  
  // Handle unexpected object structures gracefully
  if (typeof content === 'object') {
    // Try common content properties
    if (content.content) return content.content.trim();
    if (content.text) return content.text.trim();
    if (content.value) return content.value.trim();
    
    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('Unknown content object structure:', Object.keys(content));
    }
    
    // Last resort: stringify for debugging
    return JSON.stringify(content);
  }

  // Fallback for non-object types
  return String(content).trim();
};

/**
 * Extracts HTML content for Etherpad exports with full formatting
 * @param {string|Object} content - Content in any supported format
 * @returns {string} HTML formatted content for Etherpad
 */
export const extractHTMLContent = (content) => {
  // Handle null/undefined
  if (!content) return '';
  
  // Handle search export objects (use existing specialized formatting)
  if (typeof content === 'object' && content.analysis) {
    // Use the existing formatExportContent for search exports to maintain
    // all the complex formatting, source handling, and Etherpad-specific features
    return formatExportContent(content);
  }
  
  // Handle mixed content objects
  if (typeof content === 'object' && (content.sharepic || content.social)) {
    const mixedText = extractMixedContent(content);
    return formatTextForEtherpad(mixedText);
  }
  
  // Handle string content
  if (typeof content === 'string') {
    return formatTextForEtherpad(content);
  }
  
  // Fallback
  return formatTextForEtherpad(String(content));
};

/**
 * Formats plain text for Etherpad with basic HTML structure
 * @param {string} text - Plain text to format
 * @returns {string} HTML formatted text
 */
const formatTextForEtherpad = async (text) => {
  if (!text) return '';
  
  // Convert markdown to HTML first if needed
  if (typeof text === 'string' && isMarkdownContent(text)) {
    const { marked } = await import('marked');
    const html = marked(text, {
      breaks: true,      // Convert line breaks to <br>
      gfm: true,        // GitHub Flavored Markdown
      headerIds: false, // Don't add IDs to headers
      mangle: false     // Don't mangle autolinks
    });
    
    // Return the converted HTML directly - it's already properly formatted
    return html;
  }
  
  // Basic HTML formatting for Etherpad for non-markdown text
  // If there are no blank lines, treat single newlines as paragraph breaks to preserve spacing in Etherpad
  const hasDoubleLineBreaks = /\n{2,}/.test(text);
  let formattedText;
  if (!hasDoubleLineBreaks) {
    formattedText = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => `<p>${line}</p>`)
      .join('');
  } else {
    formattedText = text
      .split('\n\n')
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph.length > 0)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }
  
  return formattedText;
};


/**
 * Unified entry point for content extraction
 * @param {string|Object} content - Content in any supported format
 * @param {string} outputType - Output format: 'plain', 'formatted', 'html'
 * @returns {string} Extracted content in the specified format
 */
export const extractContentByType = (content, outputType = 'plain') => {
  switch (outputType) {
    case 'plain':
      return extractPlainText(content);
    case 'formatted':
      return extractFormattedText(content);
    case 'html':
      return extractHTMLContent(content);
    default:
      console.warn(`Unknown output type: ${outputType}. Defaulting to plain text.`);
      return extractPlainText(content);
  }
};