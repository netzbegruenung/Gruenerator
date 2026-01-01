/**
 * PDF operations using PDF.js
 * Handles PDF text extraction, parseability checking, and page-by-page processing
 */

import { applyMarkdownFormatting } from './textFormatting.js';
import type { PDFInfo, ParseabilityCheck, ExtractionResult, PageExtractionResult } from './types.js';

/**
 * Lazy load PDF.js to avoid memory overhead
 */
export async function getPdfJs(): Promise<any> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjsLib;
  } catch (error) {
    console.error('[OcrService] Failed to load PDF.js:', (error as Error).message);
    throw new Error('PDF.js library could not be loaded');
  }
}

/**
 * Open PDF document with PDF.js
 */
export async function openPdfDocument(pdfPath: string, pdfjsLib: any): Promise<any> {
  try {
    const loadingTask = pdfjsLib.getDocument({ url: pdfPath, useSystemFonts: true });
    const pdfDoc = await loadingTask.promise;
    return pdfDoc;
  } catch (error) {
    console.error(`[OcrService] Failed to open PDF document:`, (error as Error).message);
    throw error;
  }
}

/**
 * Get PDF information (page count)
 */
export async function getPDFInfo(
  pdfPath: string,
  getPdfJsFn: () => Promise<any>
): Promise<PDFInfo> {
  const pdfjsLib = await getPdfJsFn();
  const pdfDoc = await openPdfDocument(pdfPath, pdfjsLib);
  const pageCount = pdfDoc.numPages;

  return { pageCount };
}

/**
 * Check if PDF text can be extracted directly (sample 3 pages)
 */
export async function canExtractTextDirectly(
  pdfPath: string,
  openPdfDocumentFn: (path: string) => Promise<any>
): Promise<ParseabilityCheck> {
  const startTime = Date.now();

  try {
    const pdfDoc = await openPdfDocumentFn(pdfPath);
    const totalPages = pdfDoc.numPages;

    // Sample 3 pages: first, middle, last
    const pagesToSample = Math.min(3, totalPages);
    const sampleIndices = [
      1,
      Math.ceil(totalPages / 2),
      totalPages
    ].slice(0, pagesToSample);

    let totalText = '';
    let pagesWithText = 0;

    for (const pageNum of sampleIndices) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ')
          .trim();

        if (pageText.length > 10) {
          pagesWithText++;
          totalText += pageText + ' ';
        }
      } catch (error) {
        console.warn(`[OcrService] Failed to extract text from page ${pageNum}:`, (error as Error).message);
      }
    }

    const pageSuccessRate = pagesWithText / pagesToSample;
    const textDensity = totalText.length / pagesToSample;
    const isParseable = pageSuccessRate >= 0.66 && textDensity > 50;
    const confidence = Math.min(pageSuccessRate * textDensity / 100, 1.0);

    const processingTimeMs = Date.now() - startTime;

    console.log(
      `[OcrService] Parseability check: ${isParseable ? 'PARSEABLE' : 'NOT PARSEABLE'} ` +
      `(${pagesWithText}/${pagesToSample} pages, ${textDensity.toFixed(0)} chars/page, ${(confidence * 100).toFixed(0)}% confidence)`
    );

    return {
      isParseable,
      confidence,
      sampleText: totalText.slice(0, 500),
      stats: {
        totalPages,
        sampledPages: pagesToSample,
        pagesWithText,
        textDensity,
        pageSuccessRate,
        processingTimeMs
      }
    };
  } catch (error) {
    console.error('[OcrService] Parseability check failed:', (error as Error).message);
    return {
      isParseable: false,
      confidence: 0,
      sampleText: '',
      stats: {
        error: (error as Error).message,
        processingTimeMs: Date.now() - startTime
      }
    };
  }
}

/**
 * Extract text directly from PDF using PDF.js
 */
export async function extractTextDirectlyFromPDF(
  pdfPath: string,
  openPdfDocumentFn: (path: string) => Promise<any>,
  applyMarkdownFormattingFn: (text: string) => string,
  maxPages: number = 1000
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    const pdfDoc = await openPdfDocumentFn(pdfPath);
    const totalPages = Math.min(pdfDoc.numPages, maxPages);

    console.log(`[OcrService] Extracting text from ${totalPages} pages using PDF.js...`);

    // Process pages in batches of 10
    const batchSize = 10;
    const allPageTexts: string[] = [];
    let successfulPages = 0;

    for (let batchStart = 1; batchStart <= totalPages; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, totalPages);
      const batchPromises: Promise<PageExtractionResult>[] = [];

      for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
        batchPromises.push(
          extractPageTextDirectly(pdfDoc, pageNum, applyMarkdownFormattingFn)
        );
      }

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          allPageTexts.push(result.value.text);
          successfulPages++;
        } else if (result.status === 'rejected') {
          console.warn(`[OcrService] Page extraction failed:`, result.reason);
        }
      }

      console.log(`[OcrService] Processed pages ${batchStart}-${batchEnd} (${successfulPages}/${batchEnd} successful)`);
    }

    const fullText = allPageTexts.join('\n\n');
    const processingTimeMs = Date.now() - startTime;

    console.log(`[OcrService] PDF.js extraction completed: ${successfulPages}/${totalPages} pages, ${fullText.length} characters in ${processingTimeMs}ms`);

    return {
      text: fullText,
      pageCount: totalPages,
      method: 'pdfjs-dist',
      confidence: successfulPages / totalPages,
      stats: {
        pages: totalPages,
        successfulPages,
        processingTimeMs
      }
    };
  } catch (error) {
    console.error('[OcrService] PDF.js extraction failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Extract text from a single PDF page
 */
export async function extractPageTextDirectly(
  pdfDoc: any,
  pageNum: number,
  applyMarkdownFormattingFn: (text: string) => string
): Promise<PageExtractionResult> {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Extract text items with proper spacing
    const textItems = textContent.items.map((item: any) => item.str || '');
    const rawText = textItems.join(' ').trim();

    // Apply markdown formatting
    const formattedText = applyMarkdownFormattingFn(rawText);

    return {
      success: true,
      text: formattedText
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      error: (error as Error).message
    };
  }
}

/**
 * Extract text from base64-encoded PDF
 * Used for privacy mode or when PDF is provided as data URL
 */
export async function extractTextFromBase64PDF(
  base64Data: string,
  filename: string = 'document.pdf',
  getPdfJsFn: () => Promise<any>
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    console.log(`[OcrService] Extracting text from base64 PDF: ${filename}`);

    const pdfjsLib = await getPdfJsFn();

    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Load PDF from bytes
    const loadingTask = pdfjsLib.getDocument({ data: bytes, useSystemFonts: true });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    // Extract text from all pages
    const allPageTexts: string[] = [];
    let successfulPages = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ')
          .trim();

        if (pageText) {
          allPageTexts.push(applyMarkdownFormatting(pageText));
          successfulPages++;
        }
      } catch (error) {
        console.warn(`[OcrService] Failed to extract text from page ${pageNum}:`, (error as Error).message);
      }
    }

    const fullText = allPageTexts.join('\n\n');
    const processingTimeMs = Date.now() - startTime;

    console.log(`[OcrService] Base64 PDF extraction completed: ${successfulPages}/${totalPages} pages, ${fullText.length} characters`);

    return {
      text: fullText,
      pageCount: totalPages,
      method: 'pdfjs-dist',
      confidence: successfulPages / totalPages,
      stats: {
        pages: totalPages,
        successfulPages,
        processingTimeMs
      }
    };
  } catch (error) {
    console.error('[OcrService] Base64 PDF extraction failed:', (error as Error).message);
    throw error;
  }
}
