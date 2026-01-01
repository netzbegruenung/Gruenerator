/**
 * Content Extractor
 * Extracts clean text content from HTML using Cheerio
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { ContentData } from '../types.js';
import { MarkdownConverter } from './MarkdownConverter.js';
import { MetadataExtractor } from './MetadataExtractor.js';

export class ContentExtractor {
  private markdownConverter: MarkdownConverter;

  constructor() {
    this.markdownConverter = new MarkdownConverter();
  }

  /**
   * Extracts clean text content from HTML using Cheerio
   */
  extractContent(html: string, url: string, enhancedMetadata: boolean = false): ContentData {
    console.log(`[ContentExtractor] Extracting content from HTML (${html.length} characters), enhanced: ${enhancedMetadata}`);

    const $ = cheerio.load(html);

    // Remove unwanted elements (be more selective to preserve content)
    $('script, style, noscript, iframe').remove();
    $('.ads, .advertisement, .cookie-notice, .cookie-banner, .popup, .modal, .overlay, .social-share').remove();

    // Extract metadata
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
    const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    const canonical = $('link[rel="canonical"]').attr('href') || url;

    // Extract enhanced metadata if requested
    let enhancedData = {};
    if (enhancedMetadata) {
      enhancedData = MetadataExtractor.extractEnhancedMetadata($, url);
    }

    // Content extraction selectors in order of preference
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#content',
      '.main-content',
      '.page-content',
      '.text-content',
      // German-specific selectors
      '.inhalt',
      '#inhalt',
      '.hauptinhalt',
      '.artikel',
      '.beitrag',
      '.inhaltsbereich',
      '.contentbereich',
      '.text',
      '.textbereich',
      '.col-content',
      '.content-area',
    ];

    let extractedContent = '';
    let extractedHtml = '';
    let contentSource = 'body';

    // Try each selector to find the main content
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        extractedContent = element.text();
        extractedHtml = element.html() || '';
        contentSource = selector;
        break;
      }
    }

    // Fallback to body if no specific content area found
    if (!extractedContent || extractedContent.trim().length < 100) {
      // Try removing only navigation elements while keeping main content
      const bodyClone = $('body').clone();
      bodyClone.find('nav, header[role="banner"], footer[role="contentinfo"], .navigation, .sidebar').remove();

      const fallbackContent = bodyClone.text().trim();
      if (fallbackContent.length > extractedContent.length) {
        extractedContent = fallbackContent;
        extractedHtml = bodyClone.html() || '';
        contentSource = 'body (nav removed)';
      } else {
        // Final fallback - use body as-is (already cleaned of scripts/ads above)
        extractedContent = $('body').text();
        extractedHtml = $('body').html() || '';
        contentSource = 'body (cleaned)';
      }
    }

    // Clean the extracted text
    const cleanedContent = MarkdownConverter.cleanExtractedText(extractedContent);

    // Convert HTML to Markdown
    const markdownContent = this.markdownConverter.convertHtmlToMarkdown(extractedHtml);

    // Extract publication date
    const publicationDate = MetadataExtractor.extractPublicationDate($);

    const result: ContentData = {
      url: url,
      title: title || 'Untitled',
      description: metaDescription || '',
      content: cleanedContent,
      markdownContent: markdownContent,
      contentSource,
      publicationDate,
      canonical: canonical || url,
      wordCount: cleanedContent.split(/\s+/).filter((word) => word.length > 0).length,
      characterCount: cleanedContent.length,
      extractedAt: new Date().toISOString(),
      ...enhancedData,
    };

    console.log(
      `[ContentExtractor] Successfully extracted ${result.wordCount} words from ${url} (source: ${contentSource}, chars: ${result.characterCount})`
    );

    return result;
  }
}
