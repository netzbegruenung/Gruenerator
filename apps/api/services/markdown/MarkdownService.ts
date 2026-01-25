/**
 * Markdown Conversion Service
 * Handles all markdown to HTML/plain text conversions
 */

import { marked } from 'marked';

// Configure marked with consistent settings
marked.setOptions({
  breaks: true, // Convert line breaks to <br>
  gfm: true, // GitHub Flavored Markdown
});

export class MarkdownService {
  /**
   * Convert markdown to HTML
   */
  markdownToHtml(markdown: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return '';
    }

    try {
      return marked.parse(markdown) as string;
    } catch (error) {
      console.error('Error converting markdown to HTML:', error);
      // Return original content on error
      return markdown;
    }
  }

  /**
   * Convert markdown to plain text (strips HTML)
   */
  markdownToPlainText(markdown: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return '';
    }

    try {
      const html = marked.parse(markdown) as string;
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
   */
  markdownForExport(markdown: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return '';
    }

    try {
      const html = marked.parse(markdown) as string;

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
   */
  isMarkdownContent(content: string): boolean {
    if (!content || typeof content !== 'string') {
      return false;
    }

    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+/m, // Headers
      /\*\*[^*]+\*\*/, // Bold
      /\*[^*]+\*/, // Italic
      /\[[^\]]+\]\([^)]+\)/, // Links
      /^[-*+]\s+/m, // Lists
      /^>\s+/m, // Blockquotes
      /`[^`]+`/, // Inline code
      /^```/m, // Code blocks
      /\|.+\|.+\|/m, // Tables (GFM)
    ];

    return markdownPatterns.some((pattern) => pattern.test(content));
  }
}

// Export singleton instance
export const markdownService = new MarkdownService();

// Export named functions for backward compatibility
export const markdownToHtml = (markdown: string) => markdownService.markdownToHtml(markdown);

export const markdownToPlainText = (markdown: string) =>
  markdownService.markdownToPlainText(markdown);

export const markdownForExport = (markdown: string) => markdownService.markdownForExport(markdown);

export const isMarkdownContent = (content: string) => markdownService.isMarkdownContent(content);
