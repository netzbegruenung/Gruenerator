/**
 * Die PDF.js-Direktextraktion, wie `OcrService` sie für text-native PDFs fährt
 * (`pdfOperations.ts`: Text-Items geometrie-basiert zusammensetzen, danach
 * `applyMarkdownFormatting` pro Seite).
 *
 * Zusammensetzung und Formatierung werden aus den Produktionsmodulen importiert
 * (`textItemJoin.ts`, `textFormatting.ts` — beide hängen an nichts); nachgebaut
 * ist nur noch die Seitenschleife. Ein zweiter Nachbau der Join-Logik wäre die
 * nächste Quelle für Drift — genau die eine Zeile, die dieser Vergleich misst.
 */
import { applyMarkdownFormatting } from '../../services/OcrService/textFormatting.js';
import { joinPdfTextItems, type PdfTextItem } from '../../services/OcrService/textItemJoin.js';

export async function extractWithPdfJs(bytes: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjsLib.getDocument({ data: bytes, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);

    const textContent = await page.getTextContent();
    const pageText = joinPdfTextItems(textContent.items as PdfTextItem[]);
    if (pageText) pages.push(applyMarkdownFormatting(pageText));
  }
  return pages.join('\n\n');
}
