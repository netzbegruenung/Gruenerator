/**
 * URL Detection Service
 * Detects and extracts URLs from text content for automatic crawling
 */

import { URL_REGEX, URL_SCANNABLE_FIELDS } from './constants.js';
import type { UrlDetectionResult, AttachmentWithUrl } from './types.js';

export class UrlDetector {
  /**
   * Detects URLs in text content
   */
  detectUrls(text: string): string[] {
    if (!text || typeof text !== 'string') return [];

    const matches = text.match(URL_REGEX);
    return matches ? Array.from(new Set(matches)) : [];
  }

  /**
   * Extracts URLs from request content fields
   */
  extractUrlsFromContent(request: Record<string, any> | string): string[] {
    if (!request) return [];

    const allUrls = new Set<string>();

    if (typeof request === 'string') {
      const urls = this.detectUrls(request);
      urls.forEach((url) => allUrls.add(url));
      return Array.from(allUrls);
    }

    if (typeof request !== 'object') return [];

    URL_SCANNABLE_FIELDS.forEach((field) => {
      if (request[field]) {
        const urls = this.detectUrls(String(request[field]));
        urls.forEach((url) => allUrls.add(url));
      }
    });

    return Array.from(allUrls);
  }

  /**
   * Validates if a string looks like a valid URL
   */
  isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Gets the domain from a URL for display purposes
   */
  getUrlDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Checks if URLs are already present in existing attachments/documents
   */
  filterNewUrls(urls: string[], existingAttachments: AttachmentWithUrl[] = []): string[] {
    if (!Array.isArray(existingAttachments) || existingAttachments.length === 0) {
      return urls;
    }

    const existingUrls = new Set<string>();
    existingAttachments.forEach((att) => {
      if (att.url) existingUrls.add(att.url);
      if (att.type === 'crawled_url' && att.url) existingUrls.add(att.url);
    });

    return urls.filter((url) => !existingUrls.has(url));
  }

  /**
   * Complete URL detection and extraction with result object
   */
  detectAndExtract(request: Record<string, any> | string): UrlDetectionResult {
    const urls = this.extractUrlsFromContent(request);
    return {
      urls,
      uniqueCount: urls.length,
    };
  }
}

export const urlDetector = new UrlDetector();

export const detectUrls = (text: string) => urlDetector.detectUrls(text);

export const extractUrlsFromContent = (request: Record<string, any> | string) =>
  urlDetector.extractUrlsFromContent(request);

export const isValidUrl = (url: string) => urlDetector.isValidUrl(url);

export const getUrlDomain = (url: string) => urlDetector.getUrlDomain(url);

export const filterNewUrls = (urls: string[], existingAttachments?: AttachmentWithUrl[]) =>
  urlDetector.filterNewUrls(urls, existingAttachments);
