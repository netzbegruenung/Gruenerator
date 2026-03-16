/**
 * Centralized content extraction utility for the Grünerator application.
 * Handles various content types and output formats to reduce code duplication.
 *
 * Note: For search exports with complex formatting requirements, the existing
 * formatExportContent from exportUtils.jsx is used to maintain specific functionality.
 */
/* global process */

import { isMarkdownContent } from '../common/Form/utils/contentUtils';

import apiClient from './apiClient';
import { formatExportContent } from './exportUtils';

interface SharepicEntry {
  text?: string;
  content?: string;
}

interface MixedContent {
  sharepic?: SharepicEntry | SharepicEntry[] | string | string[];
  social?: { content?: string } | string;
  content?: string;
  [key: string]: unknown;
}

interface SourceRecommendation {
  title: string;
  summary: string;
}

interface UnusedSource {
  title: string;
}

interface SearchExport {
  analysis?: string;
  sourceRecommendations?: SourceRecommendation[];
  unusedSources?: UnusedSource[];
  [key: string]: unknown;
}

interface ContentObject {
  analysis?: string;
  sharepic?: unknown;
  social?: unknown;
  content?: string;
  text?: string;
  value?: string;
  [key: string]: unknown;
}

/**
 * Converts HTML string to plain text while preserving basic structure
 * @param html - HTML content to convert
 * @returns Plain text with preserved structure
 */
export const convertHtmlToPlainText = async (html: string): Promise<string> => {
  if (!html) return '';

  let processedHtml = html;

  // Convert markdown to HTML first if needed using backend service
  if (typeof processedHtml === 'string' && isMarkdownContent(processedHtml)) {
    try {
      const response = await apiClient.post('/markdown/to-html', { content: processedHtml });
      if (response.data.success) {
        processedHtml = response.data.html;
      }
    } catch (error) {
      console.error('Error converting markdown to HTML:', error);
      // Continue with original content on error
    }
  }

  // Create temporary DOM element for parsing
  const tempElement = document.createElement('div');
  tempElement.innerHTML = processedHtml;

  // Add line breaks for block elements and list formatting
  const blockElements = tempElement.querySelectorAll(
    'p, div, li, h1, h2, h3, h4, h5, h6, blockquote'
  );
  blockElements.forEach((element) => {
    element.insertAdjacentHTML('afterend', '\n');

    // Add bullet points for list items
    if (element.tagName === 'LI') {
      element.insertAdjacentHTML('beforebegin', '• ');
    }
  });

  // Add extra line breaks after lists for better readability
  const lists = tempElement.querySelectorAll('ul, ol');
  lists.forEach((list) => {
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
 * @param mixedContent - Object with sharepic and/or social properties
 * @returns Combined text content
 */
export const extractMixedContent = (mixedContent: MixedContent): string => {
  if (!mixedContent || typeof mixedContent !== 'object') return '';

  const parts: string[] = [];

  if (mixedContent.sharepic) {
    const sharepicEntries = Array.isArray(mixedContent.sharepic)
      ? mixedContent.sharepic
      : [mixedContent.sharepic];

    sharepicEntries.filter(Boolean).forEach((entry) => {
      if (typeof entry === 'object') {
        const sharepicText = (entry as SharepicEntry).text || (entry as SharepicEntry).content || '';
        if (sharepicText) {
          parts.push(sharepicText);
        }
      } else if (entry) {
        parts.push(entry as string);
      }
    });
  }

  if (mixedContent.social) {
    // Extract content property if it's an object, otherwise use as-is
    const socialContent =
      typeof mixedContent.social === 'object'
        ? (mixedContent.social as { content?: string }).content || ''
        : (mixedContent.social as string);
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
 * @param searchExport - Object with analysis, sourceRecommendations, unusedSources
 * @param includeMetadata - Whether to include source recommendations and unused sources
 * @returns Formatted content
 */
export const extractSearchExportContent = (
  searchExport: SearchExport,
  includeMetadata = true
): string => {
  if (!searchExport || typeof searchExport !== 'object') return '';

  let content = '';

  // Main analysis content
  if (searchExport.analysis) {
    content = searchExport.analysis;

    // Clean HTML if present
    if (content.includes('<')) {
      content = convertHtmlToPlainText(content) as unknown as string;
    }
  }

  if (!includeMetadata) return content;

  // Add source recommendations
  if (searchExport.sourceRecommendations?.length && searchExport.sourceRecommendations.length > 0) {
    content += '\n\nQuellenempfehlungen:';
    searchExport.sourceRecommendations.forEach((rec) => {
      content += `\n• ${rec.title} - ${rec.summary}`;
    });
  }

  // Add unused sources
  if (searchExport.unusedSources?.length && searchExport.unusedSources.length > 0) {
    content += '\n\nWeitere relevante Quellen:';
    searchExport.unusedSources.forEach((source) => {
      content += `\n• ${source.title}`;
    });
  }

  return content.trim();
};

/**
 * Extracts plain text from any content type for clipboard copying
 * @param content - Content in any supported format
 * @returns Clean plain text suitable for copying
 */
export const extractPlainText = async (content: string | ContentObject): Promise<string> => {
  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('extractPlainText input:', {
      type: typeof content,
      isObject: typeof content === 'object',
      hasSharepic: !!(content as ContentObject)?.sharepic,
      hasSocial: !!(content as ContentObject)?.social,
      hasAnalysis: !!(content as ContentObject)?.analysis,
      objectKeys: typeof content === 'object' ? Object.keys(content) : null,
    });
  }

  // Handle null/undefined
  if (!content) return '';

  // Handle plain strings
  if (typeof content === 'string') {
    let processedContent: string = content;
    // Convert markdown first if needed
    if (isMarkdownContent(processedContent)) {
      const { marked } = await import('marked');
      processedContent = await marked(processedContent, {
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub Flavored Markdown
      });
    }

    // Check if it's HTML content (after potential markdown conversion)
    if (processedContent.includes('<') && processedContent.includes('>')) {
      return convertHtmlToPlainText(processedContent);
    }
    return processedContent.trim();
  }

  // Handle objects
  if (typeof content === 'object') {
    // Search export format
    if (content.analysis) {
      return extractSearchExportContent(content as SearchExport, true);
    }

    // Mixed content format (sharepic/social)
    if (content.sharepic || content.social) {
      const mixedText = extractMixedContent(content as MixedContent);
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
 * @param content - Content in any supported format
 * @returns Raw content for backend processing
 */
export const extractFormattedText = async (content: string | ContentObject): Promise<string> => {
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
      return extractSearchExportContent(content as SearchExport, true);
    }

    // Mixed content format (sharepic/social)
    if (content.sharepic || content.social) {
      return extractMixedContent(content as MixedContent);
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
 * Extracts HTML content for rich clipboard copying (Word, Etherpad)
 * Converts markdown to HTML to preserve formatting when pasting
 * @param content - Content in any supported format
 * @returns HTML formatted content for clipboard
 */
export const extractHTMLContent = async (content: string | ContentObject): Promise<string> => {
  if (!content) return '';

  // Handle strings (markdown or plain text)
  if (typeof content === 'string') {
    // Convert markdown to HTML if needed
    if (isMarkdownContent(content)) {
      const { marked } = await import('marked');
      return marked(content, {
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub Flavored Markdown
      });
    }

    // Already HTML - return as-is
    if (content.includes('<') && content.includes('>')) {
      return content;
    }

    // Plain text - wrap in paragraph for consistency
    return `<p>${content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  }

  // Handle search export objects (use existing specialized formatter)
  if (typeof content === 'object' && content.analysis) {
    return await formatExportContent(content as Parameters<typeof formatExportContent>[0]);
  }

  // Handle mixed content (sharepic/social)
  if (typeof content === 'object' && (content.sharepic || content.social)) {
    const text = extractMixedContent(content as MixedContent);
    if (isMarkdownContent(text)) {
      const { marked } = await import('marked');
      return marked(text, {
        breaks: true,
        gfm: true,
      });
    }
    return `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  }

  // Fallback
  return `<p>${String(content)}</p>`;
};
