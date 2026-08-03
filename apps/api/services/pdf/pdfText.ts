/**
 * Text extraction from PDF bytes — the one implementation.
 *
 * It lived as a private method on `PdfCrawler`, reachable only by fetching a
 * URL. That was enough while the only PDFs we read came from the web; it stopped
 * being enough once the chat had to read back a PDF it had created itself, which
 * sits on disk as a compute asset and has no URL a crawler could fetch.
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Concatenated text of every page, pages separated by a blank line.
 *
 * Throws when the bytes are not a readable PDF — an empty string would be
 * indistinguishable from a genuinely blank document, and the callers act very
 * differently on the two.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.0.227/standard_fonts/',
    });

    const pdfDocument = await loadingTask.promise;
    const pages = await Promise.all(
      Array.from({ length: pdfDocument.numPages }, (_, i) =>
        pdfDocument.getPage(i + 1).then(async (page) => {
          const textContent = await page.getTextContent();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
          return textContent.items.map((item: any) => item.str).join(' ');
        })
      )
    );
    return pages.join('\n\n');
  } catch (error) {
    throw new Error(
      `PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
