/**
 * PDF Crawler
 * Extracts text content from PDF documents using pdfjs-dist
 */

import { safeFetch } from '../../../../../utils/validation/urlSecurity.js';
import { extractPdfText } from '../../../../pdf/pdfText.js';

import type { CrawlerConfig, PdfExtractionResult } from '../types.js';

export class PdfCrawler {
  constructor(private config: CrawlerConfig) {}

  /**
   * Crawls PDF documents and extracts text content
   */
  async crawlPdf(url: string): Promise<PdfExtractionResult> {
    console.log(`[PdfCrawler] Fetching PDF: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await safeFetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.config.userAgent,
          Accept: 'application/pdf,*/*',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.config.maxContentLength) {
        throw new Error(`PDF too large: ${contentLength} bytes`);
      }

      // Get PDF as array buffer
      const pdfBuffer = await response.arrayBuffer();

      // Extract text from PDF
      const extractedText = await extractPdfText(new Uint8Array(pdfBuffer));

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text content extracted from PDF');
      }

      return {
        text: extractedText,
        finalUrl: response.url,
        statusCode: response.status,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`PDF fetch timeout after ${this.config.timeout}ms`);
      }

      throw error;
    }
  }
}
