/**
 * Fetch Crawler
 * Fallback crawling using native fetch API
 */

import { safeFetch } from '../../../../../utils/validation/urlSecurity.js';

import { PdfCrawler } from './PdfCrawler.js';

import type { CrawlerConfig, RawCrawlResult, CrawlOptions } from '../types.js';

export class FetchCrawler {
  private pdfCrawler: PdfCrawler;

  constructor(private config: CrawlerConfig) {
    this.pdfCrawler = new PdfCrawler(config);
  }

  /**
   * Fallback crawling using native fetch
   */
  async crawlWithFetch(url: string, options: CrawlOptions = {}): Promise<RawCrawlResult> {
    const fetchOptions = {
      ...this.config,
      ...options,
    };

    console.log(`[FetchCrawler] Fetching URL: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      fetchOptions.timeout || this.config.timeout
    );

    try {
      const response = await safeFetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': fetchOptions.userAgent || this.config.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          DNT: '1',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type and route to appropriate handler
      const contentType = response.headers.get('content-type') || '';

      // Handle PDFs with dedicated PDF crawler
      if (contentType.includes('application/pdf')) {
        console.log(`[FetchCrawler] Detected PDF, routing to PDF handler`);
        const pdfResult = await this.pdfCrawler.crawlPdf(url);

        // Format PDF result to match HTML structure
        return {
          html: `<html><head><title>PDF Document</title></head><body><pre>${pdfResult.text}</pre></body></html>`,
          finalUrl: pdfResult.finalUrl,
          statusCode: pdfResult.statusCode,
          isPdf: true,
          pdfText: pdfResult.text,
        };
      }

      // Only accept HTML for non-PDF content
      if (!contentType.includes('text/html')) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.config.maxContentLength) {
        throw new Error(`Content too large: ${contentLength} bytes`);
      }

      const html = await response.text();

      return {
        html,
        finalUrl: response.url,
        statusCode: response.status,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${fetchOptions.timeout || this.config.timeout}ms`);
      }

      throw error;
    }
  }
}
