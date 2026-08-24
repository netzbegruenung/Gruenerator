/**
 * Die PDF.js-Direktextraktion, wie `OcrService` sie für text-native PDFs fährt
 * (`pdfOperations.ts`: jedes Text-Item per `join(' ')` aneinander, danach
 * `applyMarkdownFormatting` pro Seite).
 *
 * Die Zusammensetzung ist bewusst nachgebaut statt importiert: `OcrService` zieht
 * Datenbank, Docling-Probe und Mistral-Client mit, und der Punkt dieses Vergleichs
 * ist genau die eine Zeile, die den Text zusammensetzt. Der Formatierungsschritt
 * dagegen wird aus dem Produktionsmodul importiert — `textFormatting.ts` hängt an
 * nichts, und ein zweiter Nachbau wäre die nächste Quelle für Drift.
 *
 * Auf der Fixture ist dieser Schritt ein No-op (gemessen 24.08.2026: 18 601
 * Zeichen mit wie ohne). Das liegt an der Bauform der Rohseite: `join(' ')`
 * liefert die ganze Seite als EINE Zeile, und `applyMarkdownFormatting` arbeitet
 * zeilenweise — bei tausenden Zeichen greift keine seiner Überschriften-Regeln.
 * Er steht hier trotzdem, damit die Messung den Produktionspfad vollständig
 * abbildet und ein anderes PDF (oder eine geänderte Regel) den Unterschied hier
 * zeigt statt ihn zu verstecken.
 */
import { applyMarkdownFormatting } from '../../services/OcrService/textFormatting.js';

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
    if (pageText) pages.push(applyMarkdownFormatting(pageText));
  }
  return pages.join('\n\n');
}
