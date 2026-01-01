/**
 * PDF Processor
 * Extracts text from PDFs using Mistral OCR
 * Fallback strategy: data-url first (faster), then file upload
 */

/**
 * PDF text extraction with Mistral OCR
 * Two-step fallback for reliability
 */
export class PdfProcessor {
  constructor(private mistralClient: any) {}

  /**
   * Extract text from PDF using Mistral OCR
   * Tries data-url method first (faster), falls back to file upload if needed
   *
   * @param pdfBuffer - PDF file as Buffer
   * @param filename - Original filename for logging/upload
   * @param log - Logging function
   * @returns Extracted text and page count
   */
  async extractTextWithMistral(
    pdfBuffer: Buffer,
    filename: string,
    log: (msg: string) => void
  ): Promise<{ text: string; pageCount: number }> {
    log(`Extracting text from PDF with Mistral OCR: ${filename}`);

    // STEP 1: Try data-url method first (faster, no file upload needed)
    try {
      const base64 = pdfBuffer.toString('base64');
      const dataUrl = `data:application/pdf;base64,${base64}`;

      const ocrResponse = await this.mistralClient.ocr.process({
        model: 'mistral-ocr-latest',
        document: { type: 'document_url', documentUrl: dataUrl },
        include_image_base64: false,
      });

      const pages = ocrResponse?.pages || [];
      if (pages.length > 0) {
        const text = pages
          .map((p: any) => (p.markdown || p.text || '').trim())
          .filter(Boolean)
          .join('\n\n');
        log(`✓ Mistral OCR (data-url) extracted ${text.length} chars from ${pages.length} pages`);
        return { text, pageCount: pages.length };
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      log(`⚠ Mistral OCR data-url failed: ${errorMessage}, trying file upload...`);
    }

    // STEP 2: Fallback - Upload file to Mistral
    let fileId: string;
    try {
      const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
      let res: any;

      // Try different Mistral client upload methods (API variations)
      if (this.mistralClient.files?.upload) {
        res = await this.mistralClient.files.upload({ file: { fileName: filename, content: blob } });
      } else if (this.mistralClient.files?.create) {
        res = await this.mistralClient.files.create({ file: { fileName: filename, content: blob } });
      } else {
        throw new Error('Mistral client does not expose a files upload method');
      }

      fileId = res?.id || res?.file?.id || res?.data?.id;
      if (!fileId) {
        throw new Error('No file ID returned from Mistral upload');
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Mistral file upload failed: ${errorMessage}`);
    }

    // Process uploaded file
    const ocrResponse = await this.mistralClient.ocr.process({
      model: 'mistral-ocr-latest',
      document: { type: 'file', fileId },
      include_image_base64: false,
    });

    const pages = ocrResponse?.pages || [];
    const text = pages
      .map((p: any) => (p.markdown || p.text || '').trim())
      .filter(Boolean)
      .join('\n\n');

    log(`✓ Mistral OCR (file upload) extracted ${text.length} chars from ${pages.length} pages`);
    return { text, pageCount: pages.length };
  }
}
