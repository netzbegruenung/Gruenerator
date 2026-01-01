/**
 * Markdown Converter
 * Converts HTML content to Markdown format using Turndown
 */

import TurndownService from 'turndown';

export class MarkdownConverter {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      strongDelimiter: '**',
    });
  }

  /**
   * Converts HTML content to Markdown format
   */
  convertHtmlToMarkdown(html: string): string {
    if (!html) return '';

    try {
      // Convert HTML to Markdown using turndown
      let markdown = this.turndownService.turndown(html);

      // Clean up the markdown
      markdown = markdown
        // Remove excessive whitespace and line breaks
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Clean up lists spacing
        .replace(/(\n- .+)\n\n(\n- .+)/g, '$1\n$2')
        // Remove empty lines at start/end
        .trim();

      return markdown;
    } catch (error) {
      console.warn('[MarkdownConverter] Error converting HTML to Markdown:', error instanceof Error ? error.message : 'Unknown error');
      // Fallback to plain text extraction if conversion fails
      return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  /**
   * Cleans extracted text content
   */
  static cleanExtractedText(text: string): string {
    if (!text) return '';

    return (
      text
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Remove excessive line breaks
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Trim leading/trailing whitespace
        .trim()
        // Remove common boilerplate text patterns
        .replace(/Cookie\s+(Policy|Notice|Consent)[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
        .replace(/Accept\s+all\s+cookies?[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
        // Remove social media sharing text
        .replace(/Share\s+on\s+(Facebook|Twitter|LinkedIn|Instagram)[\s\S]*?(?=\n|\s[A-Z])/gi, '')
        // Clean up remaining whitespace
        .replace(/\s+/g, ' ')
        .trim()
    );
  }
}
