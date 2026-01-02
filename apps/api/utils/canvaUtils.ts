/**
 * Canva URL processing utilities
 * Helper functions for validating and extracting metadata from Canva URLs
 */

import { urlCrawlerService, ContentExtractor } from '../services/scrapers/implementations/UrlCrawler/index.js';
import { createLogger } from './logger.js';

const contentExtractor = new ContentExtractor();

const log = createLogger('canvaUtils');

// ============================================================================
// Types
// ============================================================================

export interface CanvaValidationResult {
  isValid: boolean;
  designId?: string;
  viewKey?: string | null;
  cleanUrl?: string;
  thumbnailUrl?: string | null;
  error?: string;
}

export interface CanvaTemplateData {
  title: string;
  description: string;
  template_type: string;
  canva_url: string;
  designId: string;
  originalUrl: string;
  preview_image_url?: string | null;
  dimensions?: any;
  categories?: string[];
}

export interface CanvaProcessResult {
  success: boolean;
  templateData?: CanvaTemplateData;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts tags from description using #hashtag syntax
 */
export function extractTagsFromDescription(description: string | undefined | null): string[] {
  if (!description || typeof description !== 'string') return [];
  const tagPattern = /#([\w-]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagPattern.exec(description)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/**
 * Validates and extracts information from Canva URLs
 */
export async function validateCanvaUrl(url: string): Promise<CanvaValidationResult> {
  try {
    const urlObj = new URL(url);

    // Check if it's a Canva domain
    if (!urlObj.hostname.includes('canva.com')) {
      return {
        isValid: false,
        error: 'URL muss von canva.com stammen.'
      };
    }

    // Extract design ID and view key from various Canva URL patterns
    const designMatch = urlObj.pathname.match(/\/design\/([A-Za-z0-9_-]+)/);
    if (!designMatch) {
      return {
        isValid: false,
        error: 'Ungültige Canva URL. Bitte verwenden Sie eine gültige Design-URL.'
      };
    }

    const designId = designMatch[1];

    // Extract the view key (second path segment after design ID)
    const fullPathMatch = urlObj.pathname.match(/\/design\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    const viewKey = fullPathMatch && fullPathMatch[2] && !['view', 'edit', 'watch'].includes(fullPathMatch[2])
      ? fullPathMatch[2]
      : null;

    // Create a clean URL without tracking parameters
    const cleanUrl = viewKey
      ? `https://www.canva.com/design/${designId}/${viewKey}/view`
      : `https://www.canva.com/design/${designId}/view`;

    // Construct thumbnail URL
    const thumbnailUrl = viewKey
      ? `https://www.canva.com/design/${designId}/${viewKey}/screen`
      : null;

    return {
      isValid: true,
      designId,
      viewKey,
      cleanUrl,
      thumbnailUrl
    };
  } catch {
    return {
      isValid: false,
      error: 'Ungültiges URL-Format.'
    };
  }
}

/**
 * Processes a Canva URL to extract metadata and create template data
 */
export async function processCanvaUrl(url: string, enhancedMetadata: boolean = false): Promise<CanvaProcessResult> {
  try {
    // Validate the Canva URL first
    const validation = await validateCanvaUrl(url);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // Try to extract title and enhanced metadata from Canva page
    let title = `Canva Design ${validation.designId}`;
    let description = '';
    let previewImage: string | null = validation.thumbnailUrl || null;
    let dimensions: any = null;
    let categories: string[] = [];

    try {
      // Use direct HTML fetching with optional enhanced metadata
      const { html } = await urlCrawlerService.fetchUrl(url);
      const extractedData = contentExtractor.extractContent(html, url, enhancedMetadata);

      if (extractedData && extractedData.title) {
        title = extractedData.title;
        description = extractedData.description || '';

        // Clean up Canva-specific title patterns
        title = title
          .replace(/\s*-\s*Canva$/, '')
          .replace(/^Canva\s*-\s*/, '')
          .trim();

        if (!title || title.length < 2) {
          title = `Canva Design ${validation.designId}`;
        }
      }

      // Extract enhanced metadata if requested
      if (enhancedMetadata && extractedData) {
        if (extractedData.previewImage) {
          previewImage = extractedData.previewImage;
        }
        dimensions = extractedData.dimensions || null;
        categories = extractedData.categories || [];

        log.debug('[processCanvaUrl] Enhanced metadata extracted:', {
          hasPreviewImage: !!previewImage,
          hasDimensions: !!dimensions,
          categoriesCount: categories.length
        });
      }

      log.debug('[processCanvaUrl] Successfully extracted data from Canva page:', { title, enhancedMetadata });
    } catch (error) {
      const err = error as Error;
      log.warn('[processCanvaUrl] Could not extract data from HTML, using constructed thumbnail URL:', err.message);
      title = `Canva Design ${validation.designId}`;
    }

    const templateData: CanvaTemplateData = {
      title,
      description,
      template_type: 'canva',
      canva_url: validation.cleanUrl!,
      designId: validation.designId!,
      originalUrl: url
    };

    // Add preview image URL
    if (previewImage) {
      templateData.preview_image_url = previewImage;
    }

    // Add other enhanced metadata if available
    if (enhancedMetadata) {
      if (dimensions) {
        templateData.dimensions = dimensions;
      }
      if (categories.length > 0) {
        templateData.categories = categories;
      }
    }

    return {
      success: true,
      templateData
    };
  } catch (error) {
    const err = error as Error;
    log.error('[processCanvaUrl] Error processing Canva URL:', err);
    return {
      success: false,
      error: 'Fehler beim Verarbeiten der Canva URL: ' + err.message
    };
  }
}
