/**
 * Content parsing utilities for document exports
 * Handles HTML/markdown to structured content conversion
 */

import { markdownForExport, isMarkdownContent } from '../../services/markdown/index.js';

import type {
  FormattedSegment,
  FormattedParagraph,
  ParsedElement,
  ContentSection,
} from './types.js';

/**
 * Parse a single paragraph and return an array of formatted segments
 */
export function parseFormattedParagraph(text: string): FormattedSegment[] {
  const segments: FormattedSegment[] = [];

  // Handle line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Handle list items
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  text = text.replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1');
  text = text.replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1');

  // Regular expressions for formatting
  const patterns = [
    // HTML tags
    { regex: /<strong[^>]*>(.*?)<\/strong>/gi, bold: true, italic: false },
    { regex: /<b[^>]*>(.*?)<\/b>/gi, bold: true, italic: false },
    { regex: /<em[^>]*>(.*?)<\/em>/gi, bold: false, italic: true },
    { regex: /<i[^>]*>(.*?)<\/i>/gi, bold: false, italic: true },
    // Markdown patterns
    { regex: /\*\*\*(.*?)\*\*\*/g, bold: true, italic: true },
    { regex: /\*\*(.*?)\*\*/g, bold: true, italic: false },
    { regex: /\*(.*?)\*/g, bold: false, italic: true },
    { regex: /___(.*?)___/g, bold: true, italic: true },
    { regex: /__(.*?)__/g, bold: true, italic: false },
    { regex: /_(.*?)_/g, bold: false, italic: true },
  ];

  const foundFormatting: Array<{
    start: number;
    end: number;
    content: string;
    bold: boolean;
    italic: boolean;
    fullMatch: string;
  }> = [];

  // Find all formatting matches
  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = regex.exec(text)) !== null) {
      foundFormatting.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        bold: pattern.bold,
        italic: pattern.italic,
        fullMatch: match[0],
      });

      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  });

  // Sort by start position
  foundFormatting.sort((a, b) => a.start - b.start);

  // Build segments
  let lastEnd = 0;

  foundFormatting.forEach((format) => {
    if (format.start > lastEnd) {
      const beforeText = text.substring(lastEnd, format.start);
      if (beforeText.trim()) {
        segments.push({ text: beforeText, bold: false, italic: false });
      }
    }

    segments.push({
      text: format.content,
      bold: format.bold,
      italic: format.italic,
    });

    lastEnd = format.end;
  });

  // Add remaining text
  if (lastEnd < text.length) {
    const remainingText = text.substring(lastEnd);
    if (remainingText.trim()) {
      segments.push({ text: remainingText, bold: false, italic: false });
    }
  }

  // Helper to fully strip HTML tags (handles nested/malformed tags)
  const stripHtmlTags = (str: string): string => {
    let result = str;
    let prev = '';
    while (prev !== result) {
      prev = result;
      result = result.replace(/<[^>]*>/g, '');
    }
    return result;
  };

  // If no formatting was found, return the whole text as one segment
  if (segments.length === 0) {
    const cleanText = stripHtmlTags(text).trim();
    if (cleanText) {
      segments.push({ text: cleanText, bold: false, italic: false });
    }
  }

  // Clean up any remaining HTML tags from all segments
  return segments
    .map((segment) => ({
      ...segment,
      text: stripHtmlTags(segment.text).trim(),
    }))
    .filter((segment) => segment.text.length > 0);
}

/**
 * Parse content with formatting information preserved
 */
export function parseFormattedContent(input: string | null | undefined): FormattedParagraph[] {
  if (!input) return [];

  let content = String(input);

  // First check if this is markdown and convert it
  if (isMarkdownContent(content)) {
    content = markdownForExport(content);
  }

  // Convert basic HTML entities (preserve &lt; and &gt; to prevent XSS from double-encoded content)
  content = content
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;(?!(lt|gt|amp|quot|nbsp);)/gi, '&');

  // Parse paragraphs and headers separately
  const elements: ParsedElement[] = [];
  const regex = /<(h[1-6]|p|div|section|article)[^>]*>(.*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    const innerContent = match[2].trim();

    if (!innerContent) continue;

    const isHeader = /^h[1-6]$/.test(tag);
    const headerLevel = isHeader ? parseInt(tag[1]) : null;

    elements.push({ content: innerContent, isHeader, headerLevel, tag });
  }

  // If no elements were found, try splitting by tags
  if (elements.length === 0) {
    const paragraphs = content
      .split(/<\/(h[1-6]|p|div|section|article)>/gi)
      .map((para) => {
        const headerMatch = para.match(/^<(h[1-6])[^>]*>(.*)/i);
        if (headerMatch) {
          return {
            content: headerMatch[2].trim(),
            isHeader: true,
            headerLevel: parseInt(headerMatch[1][1]),
            tag: headerMatch[1].toLowerCase(),
          };
        }

        para = para.replace(/^<(h[1-6]|p|div|section|article)[^>]*>/gi, '');
        para = para.replace(/<\/(h[1-6]|p|div|section|article)>/gi, '');
        para = para.replace(/^<p>$/gi, '').replace(/^<\/p>$/gi, '');
        para = para.trim();

        if (!para || para === 'p' || para === '/p') return null;

        return { content: para, isHeader: false, headerLevel: null, tag: 'p' };
      })
      .filter((el): el is ParsedElement => el !== null);

    elements.push(...paragraphs);
  }

  return elements.map((element) => {
    const segments = parseFormattedParagraph(element.content);
    return {
      segments,
      isHeader: element.isHeader,
      headerLevel: element.headerLevel,
    };
  });
}

/**
 * Convert HTML to plain text
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';

  let text = String(html);

  // Convert line breaks to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // Convert list items
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');

  // Remove all remaining HTML tags (loop to handle nested/malformed tags)
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(/<[^>]+>/g, '');
  }

  // Convert HTML entities (decode &amp; last to prevent double-decoding like &amp;lt; → < )
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');

  return text.trim();
}

/**
 * Parse content into sections with headers
 */
export function parseSections(plain: string | null | undefined): ContentSection[] {
  const paragraphs = (plain || '').split(/\n\s*\n/);
  const sections: ContentSection[] = [];
  let current: ContentSection | null = null;

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;

    if (p.length < 100 && (p === p.toUpperCase() || /^.+:\s*$/.test(p))) {
      if (current) sections.push(current);
      current = { header: p.replace(/:$/, ''), content: [] };
    } else {
      if (!current) current = { header: null, content: [] };
      current.content.push(p);
    }
  }

  if (current) sections.push(current);
  return sections;
}
