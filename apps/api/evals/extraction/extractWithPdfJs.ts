/**
 * Die PDF.js-Direktextraktion, wie `OcrService` sie für text-native PDFs fährt
 * (`pdfOperations.ts`: jedes Text-Item per `join(' ')` aneinander).
 *
 * Bewusst nachgebaut statt importiert: `OcrService` zieht Datenbank, Docling-Probe
 * und Mistral-Client mit, und der Punkt dieses Vergleichs ist genau die eine
 * Zeile, die den Text zusammensetzt.
 */
export async function extractWithPdfJs(bytes: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjsLib.getDocument({ data: bytes, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);

    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{ str?: string }>;
    const pageText = items
      .map((item) => item.str || '')
      .join(' ')
      .trim();
    if (pageText) pages.push(pageText);
  }
  return pages.join('\n\n');
}
