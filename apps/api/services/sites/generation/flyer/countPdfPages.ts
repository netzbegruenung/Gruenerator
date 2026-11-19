import { PDFDocument } from 'pdf-lib';

/** Page count of a PDF buffer, or null when it cannot be parsed. */
export async function countPdfPages(pdf: Buffer): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
}
