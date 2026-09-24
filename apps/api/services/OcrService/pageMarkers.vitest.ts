/**
 * `## Seite N` im extrahierten Text — nur auf Wunsch, und mit der echten
 * Seitenzahl: eine leere oder gescheiterte Seite bekommt keine Marke, darf die
 * folgenden aber nicht nach vorn rücken lassen.
 *
 * Ohne die Option muss die Ausgabe bleiben, wie sie war — die Scraper hashen
 * sie für ihre Unverändert-Prüfung.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { splitTextByPageMarkers } from '../document-services/TextChunker/pageMarkerProcessing.js';

const mockProcess = vi.fn();

vi.mock('../ai/mistralClient.js', () => ({
  default: { ocr: { process: mockProcess } },
}));

vi.mock('fs', () => ({
  promises: { readFile: vi.fn().mockResolvedValue(Buffer.from('fake-file-content')) },
}));

const { extractBase64WithMistralOCR, extractTextWithMistralOCR } =
  await import('./mistralIntegration.js');
const { extractTextDirectlyFromPDF, extractTextFromBase64PDF } = await import('./pdfOperations.js');
const { joinPagesWithMarkers, replaceMarkedPages, stripPageMarkers } =
  await import('./pageMarkers.js');

const getMediaType = () => 'application/pdf';

const ocrResponse = {
  pages: [
    { markdown: 'Präambel', index: 0, images: [], dimensions: null },
    { markdown: '   ', index: 1, images: [], dimensions: null },
    { markdown: 'Beschluss A1', index: 2, images: [], dimensions: null },
  ],
  model: 'mistral-ocr-4-0',
  usageInfo: { pagesProcessed: 3, docSizeBytes: 1024 },
};

beforeEach(() => {
  mockProcess.mockReset().mockResolvedValue(ocrResponse);
});

describe('Mistral OCR — Seitenmarken', () => {
  it('nummeriert nach page.index, eine leere Seite verschiebt nichts', async () => {
    const result = await extractTextWithMistralOCR('/tmp/a.pdf', getMediaType, {
      pageMarkers: true,
    });

    expect(result.text).toBe('## Seite 1\n\nPräambel\n\n## Seite 3\n\nBeschluss A1');
    expect(result.pageCount).toBe(3);
    expect(splitTextByPageMarkers(result.text).map((p) => p.pageNumber)).toEqual([1, 3]);
  });

  it('gilt auch für den base64-Eingang', async () => {
    const result = await extractBase64WithMistralOCR('ZmFrZQ==', 'a.pdf', 'application/pdf', {
      pageMarkers: true,
    });
    expect(result.text).toBe('## Seite 1\n\nPräambel\n\n## Seite 3\n\nBeschluss A1');
  });

  it('bleibt ohne die Option byteweise wie bisher', async () => {
    const result = await extractTextWithMistralOCR('/tmp/a.pdf', getMediaType);
    expect(result.text).toBe('Präambel\n\n---\n\nBeschluss A1');
    const base64 = await extractBase64WithMistralOCR('ZmFrZQ==', 'a.pdf', 'application/pdf');
    expect(base64.text).toBe('Präambel\n\n---\n\nBeschluss A1');
  });
});

/** Eine Zeile Text als pdfjs-Item. */
const item = (str: string) => ({ str, transform: [12, 0, 0, 12, 0, 700], width: str.length * 6 });

/**
 * Vier Seiten: 1 Text, 2 wirft beim Lesen, 3 ist leer, 4 Text.
 */
function fakePdf() {
  const pages: Record<number, () => Promise<unknown>> = {
    1: async () => ({ getTextContent: async () => ({ items: [item('Erste Seite')] }) }),
    2: async () => {
      throw new Error('kaputte Seite');
    },
    3: async () => ({ getTextContent: async () => ({ items: [] }) }),
    4: async () => ({ getTextContent: async () => ({ items: [item('Vierte Seite')] }) }),
  };
  return { numPages: 4, getPage: (n: number) => pages[n]() };
}

const identity = (t: string) => t;

/** Eine Seite mit einem Raster aus 3 × 3 Zellen — `pageHasTable` schlägt an. */
const tableItems = [700, 686, 672].flatMap((y) => [
  { str: 'Posten', transform: [10, 0, 0, 10, 60, y], width: 30 },
  { str: 'Betrag', transform: [10, 0, 0, 10, 220, y], width: 30 },
  { str: 'Ressort', transform: [10, 0, 0, 10, 380, y], width: 35 },
]);

function pdfWithTableOnPage2() {
  const pages: Record<number, () => Promise<unknown>> = {
    1: async () => ({ getTextContent: async () => ({ items: [item('Erste Seite')] }) }),
    2: async () => ({ getTextContent: async () => ({ items: tableItems }) }),
  };
  return { numPages: 2, getPage: (n: number) => pages[n]() };
}

describe('PDF.js — Seitenmarken', () => {
  it('behält die Nummer, wenn eine Seite scheitert oder leer ist', async () => {
    const result = await extractTextDirectlyFromPDF(
      '/tmp/a.pdf',
      async () => fakePdf(),
      identity,
      1000,
      { pageMarkers: true }
    );

    expect(result.text).toBe('## Seite 1\n\nErste Seite\n\n## Seite 4\n\nVierte Seite');
    expect(result.pageCount).toBe(4);
  });

  it('bleibt ohne die Option wie bisher (leere Seite als Leerabsatz)', async () => {
    const result = await extractTextDirectlyFromPDF('/tmp/a.pdf', async () => fakePdf(), identity);
    expect(result.text).toBe('Erste Seite\n\n\n\nVierte Seite');
  });

  it('base64-PDF: dieselbe Nummerierung', async () => {
    const getPdfJs = async () => ({
      getDocument: () => ({ promise: Promise.resolve(fakePdf()) }),
    });
    const marked = await extractTextFromBase64PDF('ZmFrZQ==', 'a.pdf', getPdfJs, {
      pageMarkers: true,
    });
    expect(splitTextByPageMarkers(marked.text).map((p) => p.pageNumber)).toEqual([1, 4]);

    const plain = await extractTextFromBase64PDF('ZmFrZQ==', 'a.pdf', getPdfJs);
    expect(plain.text).not.toContain('## Seite');
  });
});

describe('PDF.js — Tabellenseiten', () => {
  it('meldet Tabellenseiten nur mit Marken, der Text bleibt derselbe', async () => {
    const marked = await extractTextDirectlyFromPDF(
      '/tmp/a.pdf',
      async () => pdfWithTableOnPage2(),
      identity,
      1000,
      { pageMarkers: true }
    );
    expect(marked.tablePages).toEqual([2]);

    const plain = await extractTextDirectlyFromPDF(
      '/tmp/a.pdf',
      async () => pdfWithTableOnPage2(),
      identity
    );
    expect(plain).not.toHaveProperty('tablePages');
    expect(plain.text).toBe(stripPageMarkers(marked.text));
  });

  it('base64-PDF: dieselbe Erkennung', async () => {
    const getPdfJs = async () => ({
      getDocument: () => ({ promise: Promise.resolve(pdfWithTableOnPage2()) }),
    });
    const marked = await extractTextFromBase64PDF('ZmFrZQ==', 'a.pdf', getPdfJs, {
      pageMarkers: true,
    });
    expect(marked.tablePages).toEqual([2]);
    const plain = await extractTextFromBase64PDF('ZmFrZQ==', 'a.pdf', getPdfJs);
    expect(plain).not.toHaveProperty('tablePages');
  });
});

describe('replaceMarkedPages', () => {
  const text = 'Vorspann\n\n## Seite 1\n\nEins\n\n## Seite 2\n\nZwei a b c\n\n## Seite 3\n\nDrei';

  it('ersetzt nur die Zielseite, alle Marken bleiben stehen', () => {
    expect(replaceMarkedPages(text, new Map([[2, '| a | b | c |\n| --- | --- | --- |\n']]))).toBe(
      'Vorspann\n\n## Seite 1\n\nEins\n\n## Seite 2\n\n| a | b | c |\n| --- | --- | --- |\n\n## Seite 3\n\nDrei'
    );
  });

  it('ersetzt auch die letzte Seite, ohne Anhängsel', () => {
    expect(replaceMarkedPages(text, new Map([[3, 'Drei neu']]))).toBe(
      'Vorspann\n\n## Seite 1\n\nEins\n\n## Seite 2\n\nZwei a b c\n\n## Seite 3\n\nDrei neu'
    );
  });

  it('lässt den Text bei leerer Ersatzfassung oder unbekannter Seite unverändert', () => {
    expect(
      replaceMarkedPages(
        text,
        new Map([
          [2, '  '],
          [9, 'neun'],
        ])
      )
    ).toBe(text);
  });
});

describe('joinPagesWithMarkers / stripPageMarkers', () => {
  it('liefert für lauter leere Seiten einen leeren Text', () => {
    expect(
      joinPagesWithMarkers([
        { page: 1, text: ' ' },
        { page: 2, text: '' },
      ])
    ).toBe('');
  });

  it('nimmt die Markenzeilen wieder heraus', () => {
    expect(stripPageMarkers('## Seite 1\n\nPräambel\n\n## Seite 3\n\nBeschluss')).toBe(
      'Präambel\n\nBeschluss'
    );
  });
});
