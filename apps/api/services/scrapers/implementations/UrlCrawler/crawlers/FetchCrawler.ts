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
          // `application/pdf` is named rather than left to the `*/*` tail: a
          // primary source is very often a PDF (EUR-Lex, Drucksachen, Satzungen),
          // and a server that content-negotiates hands an HTML landing page to
          // anyone who only asks for HTML.
          Accept:
            'text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,image/webp,*/*;q=0.8',
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
        return this.asPdfResult(url);
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

      // The header said HTML, the bytes say PDF. Trusting the header alone is
      // how a primary source goes missing: the content type is the server's
      // claim, the magic number is the file. `%PDF-` survives a UTF-8 decode
      // (it is ASCII), so it can be checked on the decoded body.
      if (html.startsWith('%PDF-')) {
        console.log(`[FetchCrawler] Body is a PDF despite content-type "${contentType}"`);
        return this.asPdfResult(url);
      }

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

  /** Run the PDF crawler and wrap its text in the HTML shape callers expect. */
  private async asPdfResult(url: string): Promise<RawCrawlResult> {
    const pdfResult = await this.pdfCrawler.crawlPdf(url);
    return {
      html: `<html><head><title>PDF Document</title></head><body><pre>${pdfResult.text}</pre></body></html>`,
      finalUrl: pdfResult.finalUrl,
      statusCode: pdfResult.statusCode,
      isPdf: true,
      pdfText: pdfResult.text,
    };
  }
}
