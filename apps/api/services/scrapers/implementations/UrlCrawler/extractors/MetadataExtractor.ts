/**
 * Metadata Extractor
 * Extracts enhanced metadata from HTML for rich content
 */

import type { CheerioAPI } from 'cheerio';
import type { EnhancedMetadata } from '../types.js';

export class MetadataExtractor {
  /**
   * Attempts to extract publication date from the page
   */
  static extractPublicationDate($: CheerioAPI): string | null {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[property="og:article:published_time"]',
      'meta[name="published_time"]',
      'meta[name="date"]',
      'time[datetime]',
      '.published-date',
      '.publication-date',
      '.article-date',
      '.post-date',
    ];

    for (const selector of dateSelectors) {
      try {
        let dateValue: string | undefined = undefined;

        if (selector.includes('meta')) {
          dateValue = $(selector).attr('content');
        } else if (selector.includes('time')) {
          dateValue = $(selector).attr('datetime') || $(selector).text();
        } else {
          dateValue = $(selector).text();
        }

        if (dateValue) {
          // Try to parse the date
          const parsedDate = new Date(dateValue.trim());
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        }
      } catch (err) {
        // Continue to next selector
        continue;
      }
    }

    return null;
  }

  /**
   * Extracts enhanced metadata from HTML for rich content like templates
   */
  static extractEnhancedMetadata($: CheerioAPI, url: string): EnhancedMetadata {
    const enhancedData: EnhancedMetadata = {};

    // Extract Open Graph image (preview image)
    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href');

    if (ogImage) {
      // Make URL absolute if relative
      try {
        const imageUrl = new URL(ogImage, url).href;
        enhancedData.previewImage = imageUrl;
      } catch (error) {
        console.warn('[MetadataExtractor] Invalid image URL:', ogImage);
      }
    }

    // Extract dimensions from Open Graph
    const ogWidth = $('meta[property="og:image:width"]').attr('content');
    const ogHeight = $('meta[property="og:image:height"]').attr('content');

    if (ogWidth && ogHeight) {
      enhancedData.dimensions = {
        width: parseInt(ogWidth, 10),
        height: parseInt(ogHeight, 10),
      };
    }

    // Extract categories from various sources
    const categories = new Set<string>();

    // Try meta keywords
    const keywords = $('meta[name="keywords"]').attr('content');
    if (keywords) {
      keywords.split(',').forEach((keyword) => {
        const cleaned = keyword.trim().toLowerCase();
        if (cleaned && cleaned.length > 2) {
          categories.add(cleaned);
        }
      });
    }

    // Try Open Graph tags
    const ogTags = $('meta[property="og:tags"]').attr('content') || $('meta[property="article:tag"]').attr('content');
    if (ogTags) {
      ogTags.split(',').forEach((tag) => {
        const cleaned = tag.trim().toLowerCase();
        if (cleaned && cleaned.length > 2) {
          categories.add(cleaned);
        }
      });
    }

    // Try to extract template type/category from title or description
    const titleLower = ($('title').text() || '').toLowerCase();
    const descLower = ($('meta[name="description"]').attr('content') || '').toLowerCase();
    const combinedText = `${titleLower} ${descLower}`;

    const templateTypes = [
      'flyer',
      'poster',
      'brochure',
      'presentation',
      'instagram',
      'facebook',
      'twitter',
      'social media',
      'newsletter',
      'business card',
      'logo',
      'banner',
      'story',
      'post',
      'card',
      'invitation',
      'resume',
      'cv',
    ];

    templateTypes.forEach((type) => {
      if (combinedText.includes(type)) {
        categories.add(type);
      }
    });

    if (categories.size > 0) {
      enhancedData.categories = Array.from(categories).slice(0, 5); // Limit to 5 categories
    }

    // Extract additional structured data if available
    const structuredData = this.extractStructuredData($);
    if (structuredData) {
      enhancedData.structuredData = structuredData;
    }

    console.log('[MetadataExtractor] Extracted enhanced metadata:', {
      hasPreviewImage: !!enhancedData.previewImage,
      hasDimensions: !!enhancedData.dimensions,
      categoriesCount: enhancedData.categories?.length || 0,
    });

    return enhancedData;
  }

  /**
   * Extracts structured data (JSON-LD, microdata) from HTML
   */
  private static extractStructuredData($: CheerioAPI): Record<string, any> | null {
    try {
      // Look for JSON-LD structured data
      const jsonLdScript = $('script[type="application/ld+json"]').first();
      if (jsonLdScript.length > 0) {
        const jsonLdText = jsonLdScript.html();
        if (jsonLdText) {
          return JSON.parse(jsonLdText);
        }
      }
    } catch (error) {
      console.warn('[MetadataExtractor] Error parsing structured data:', error instanceof Error ? error.message : 'Unknown error');
    }

    return null;
  }
}
