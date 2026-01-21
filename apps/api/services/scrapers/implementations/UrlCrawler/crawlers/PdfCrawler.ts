/**
 * PDF Crawler
 * Extracts text content from PDF documents using pdfjs-dist
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { CrawlerConfig, PdfExtractionResult } from '../types.js';
import { validateUrlForFetch } from '../../../../../utils/validation/urlSecurity.js';

export class PdfCrawler {
  constructor(private config: CrawlerConfig) {}

  /**
   * Crawls PDF documents and extracts text content
   */
  async crawlPdf(url: string): Promise<PdfExtractionResult> {
    const urlValidation = await validateUrlForFetch(url);
    if (!urlValidation.isValid) {
      throw new Error(`URL validation failed: ${urlValidation.error}`);
    }

    console.log(`[PdfCrawler] Fetching PDF: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
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
      const extractedText = await this.extractPdfText(pdfBuffer);

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

  /**
   * Extracts text content from PDF buffer using pdfjs-dist
   */
  private async extractPdfText(pdfBuffer: ArrayBuffer): Promise<string> {
    try {
      console.log('[PdfCrawler] Extracting text from PDF...');

      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        useSystemFonts: true,
        standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;

      console.log(`[PdfCrawler] PDF has ${numPages} pages`);

      // Extract text from all pages
      const textPromises = [];
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        textPromises.push(
          pdfDocument.getPage(pageNum).then(async (page) => {
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            return pageText;
          })
        );
      }

      const pagesText = await Promise.all(textPromises);
      const fullText = pagesText.join('\n\n');

      console.log(`[PdfCrawler] Extracted ${fullText.length} characters from PDF`);

      return fullText;
    } catch (error) {
      console.error('[PdfCrawler] Error extracting PDF text:', error);
      throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
