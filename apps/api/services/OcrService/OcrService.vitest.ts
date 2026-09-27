/**
 * Die Wege durch `OCRService` mit Seitenmarken: welche PDF über pdfjs, welche
 * über Mistral läuft, und dass erkannte Tabellenseiten — und nur sie — an
 * Mistral OCR gehen. pdfjs läuft echt gegen die Fixture aus
 * `evals/extraction`; Mistral und Docling sind Attrappen.
 *
 * Ohne Marken darf sich nichts ändern: die Scraper hashen den Text.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mistral = vi.hoisted(() => ({
  extractTextWithMistralOCR: vi.fn(),
  extractBase64WithMistralOCR: vi.fn(),
  extractPagesWithMistralOCR: vi.fn(),
}));
const docling = vi.hoisted(() => ({
  extractTextWithDocling: vi.fn(),
  extractBase64WithDocling: vi.fn(),
  isDoclingAvailable: vi.fn(),
}));

vi.mock('./mistralIntegration.js', () => mistral);
vi.mock('./doclingIntegration.js', () => docling);
vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: () => ({}) }));
vi.mock('../../database/services/QdrantService.js', () => ({ getQdrantInstance: () => ({}) }));
vi.mock('../document-services/index.js', () => ({ smartChunkDocument: vi.fn() }));
vi.mock('../mistral/index.js', () => ({ mistralEmbeddingService: {} }));

const { OCRService } = await import('./OcrService.js');
const { splitTextByPageMarkers } =
  await import('../document-services/TextChunker/pageMarkerProcessing.js');

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'evals',
  'extraction',
  '__fixtures__',
  'tabellen-pdf.pdf'
);
const FIXTURE_BASE64 = readFileSync(FIXTURE).toString('base64');

/** Eine Seite ohne Textschicht — für pdfjs ein Scan. */
const SCAN_BASE64 = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF'
).toString('base64');

const TABLE_MARKDOWN =
  '| Dienstleister | Sitz | Leistung |\n| --- | --- | --- |\n| Hetzner | DE | Hosting |';

const ocrResult = (text: string) => ({
  text,
  pageCount: 1,
  method: 'mistral-ocr' as const,
  confidence: 0.95,
});

let service: InstanceType<typeof OCRService>;

beforeEach(() => {
  for (const fn of [...Object.values(mistral), ...Object.values(docling)]) fn.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mistral.extractPagesWithMistralOCR.mockImplementation(
    async (_b64: string, _mime: string, pages: number[]) =>
      new Map(pages.map((p) => [p, `${TABLE_MARKDOWN}\n(Seite ${p})`]))
  );
  mistral.extractBase64WithMistralOCR.mockResolvedValue(ocrResult('## Seite 1\n\nOCR-Text'));
  mistral.extractTextWithMistralOCR.mockResolvedValue(ocrResult('## Seite 1\n\nOCR-Text'));
  docling.isDoclingAvailable.mockResolvedValue(true);
  docling.extractBase64WithDocling.mockResolvedValue({
    ...ocrResult('Docling'),
    method: 'docling',
  });
  service = new OCRService();
});

describe('extractTextFromBase64 mit Seitenmarken', () => {
  it('liest eine textbasierte PDF über pdfjs, Tabellenseiten über Mistral, ohne Docling', async () => {
    const result = await service.extractTextFromBase64(
      FIXTURE_BASE64,
      'datenschutz.pdf',
      'application/pdf',
      { pageMarkers: true }
    );

    expect(docling.isDoclingAvailable).not.toHaveBeenCalled();
    expect(docling.extractBase64WithDocling).not.toHaveBeenCalled();
    expect(mistral.extractBase64WithMistralOCR).not.toHaveBeenCalled();
    expect(mistral.extractPagesWithMistralOCR).toHaveBeenCalledOnce();
    expect(mistral.extractPagesWithMistralOCR).toHaveBeenCalledWith(
      FIXTURE_BASE64,
      'application/pdf',
      [3, 4]
    );

    const pages = splitTextByPageMarkers(result.text);
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pages[2].textWithoutMarker).toContain('(Seite 3)');
    expect(pages[3].textWithoutMarker).toContain('(Seite 4)');
    // pdfjs-Seiten bleiben pdfjs, auch die zweispaltige Speicherfristen-Tabelle.
    expect(pages[4].textWithoutMarker).toContain(
      'Benutzerprofile bis zur Löschung durch die Nutzer*in'
    );
    expect(pages[2].textWithoutMarker).not.toContain('Hetzner Online GmbH');
    expect(result.pageCount).toBe(8);
    expect(result.stats?.method).toBe('pdfjs-direct+mistral-tables');
  }, 30_000);

  it('behält den pdfjs-Text, wenn Mistral für die Tabellenseiten scheitert', async () => {
    mistral.extractPagesWithMistralOCR.mockRejectedValue(new Error('503'));

    const result = await service.extractTextFromBase64(
      FIXTURE_BASE64,
      'datenschutz.pdf',
      'application/pdf',
      { pageMarkers: true }
    );

    const pages = splitTextByPageMarkers(result.text);
    expect(pages).toHaveLength(8);
    expect(pages[2].textWithoutMarker).toContain('Hetzner Online GmbH');
    expect(result.stats?.method).toBe('pdfjs-direct');
  }, 30_000);

  it('schickt einen Scan mit Marken an Mistral OCR', async () => {
    const result = await service.extractTextFromBase64(SCAN_BASE64, 'scan.pdf', 'application/pdf', {
      pageMarkers: true,
    });

    expect(mistral.extractBase64WithMistralOCR).toHaveBeenCalledWith(
      SCAN_BASE64,
      'scan.pdf',
      'application/pdf',
      { pageMarkers: true }
    );
    expect(docling.extractBase64WithDocling).not.toHaveBeenCalled();
    expect(result.text).toBe('## Seite 1\n\nOCR-Text');
  });

  it('fällt für einen Scan auf Docling zurück, wenn Mistral OCR ausfällt', async () => {
    mistral.extractBase64WithMistralOCR.mockRejectedValue(new Error('503'));

    const result = await service.extractTextFromBase64(SCAN_BASE64, 'scan.pdf', 'application/pdf', {
      pageMarkers: true,
    });

    expect(docling.extractBase64WithDocling).toHaveBeenCalledWith(SCAN_BASE64, 'scan.pdf');
    expect(result.text).toBe('Docling');
  });

  it('nimmt pdfjs als letzten Ausweg, wenn Mistral ausfällt und Docling fehlt', async () => {
    mistral.extractBase64WithMistralOCR.mockRejectedValue(new Error('503'));
    docling.isDoclingAvailable.mockResolvedValue(false);

    const result = await service.extractTextFromBase64(SCAN_BASE64, 'scan.pdf', 'application/pdf', {
      pageMarkers: true,
    });

    expect(docling.extractBase64WithDocling).not.toHaveBeenCalled();
    expect(result.method).toBe('pdfjs-dist');
  });

  it('erkennt eine PDF auch am Dateinamen, wenn der MIME-Typ fehlt', async () => {
    const result = await service.extractTextFromBase64(
      FIXTURE_BASE64,
      'Datenschutz.PDF',
      'application/octet-stream',
      { pageMarkers: true }
    );

    expect(docling.isDoclingAvailable).not.toHaveBeenCalled();
    expect(mistral.extractPagesWithMistralOCR).toHaveBeenCalledWith(
      FIXTURE_BASE64,
      'application/pdf',
      [3, 4]
    );
    expect(splitTextByPageMarkers(result.text)).toHaveLength(8);
  }, 30_000);

  it('lässt DOCX weiter über Docling laufen', async () => {
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const result = await service.extractTextFromBase64('ZmFrZQ==', 'antrag.docx', mime, {
      pageMarkers: true,
    });
    expect(docling.extractBase64WithDocling).toHaveBeenCalledOnce();
    expect(result.text).toBe('Docling');
  });

  it('dekodiert Textdateien unverändert', async () => {
    const text = 'Zeile 1\n## Seite 3\nZeile 2';
    const result = await service.extractTextFromBase64(
      Buffer.from(text).toString('base64'),
      'notiz.txt',
      'text/plain',
      { pageMarkers: true }
    );
    expect(result.text).toBe(text);
    expect(docling.isDoclingAvailable).not.toHaveBeenCalled();
  });

  it('lässt PDFs ohne Marken beim bisherigen Weg (Docling zuerst)', async () => {
    const result = await service.extractTextFromBase64(
      FIXTURE_BASE64,
      'datenschutz.pdf',
      'application/pdf'
    );
    expect(result.text).toBe('Docling');
    expect(mistral.extractPagesWithMistralOCR).not.toHaveBeenCalled();
  });
});

describe('extractTextFromDocument — Tabellenseiten', () => {
  it('ersetzt mit Marken die Tabellenseiten (Notebook-Ingest)', async () => {
    const result = await service.extractTextFromDocument(FIXTURE, undefined, {
      pageMarkers: true,
    });
    expect(mistral.extractPagesWithMistralOCR).toHaveBeenCalledWith(
      FIXTURE_BASE64,
      'application/pdf',
      [3, 4]
    );
    expect(result.extractionMethod).toBe('pdfjs-direct+mistral-tables');
    expect(splitTextByPageMarkers(result.text)[2].textWithoutMarker).toContain('(Seite 3)');
  }, 30_000);

  it('ruft ohne Marken kein Mistral und liefert den reinen pdfjs-Text (Scraper)', async () => {
    const result = await service.extractTextFromDocument(FIXTURE);
    expect(mistral.extractPagesWithMistralOCR).not.toHaveBeenCalled();
    expect(result.extractionMethod).toBe('pdfjs-direct');
    expect(result).not.toHaveProperty('tablePages');
    expect(result.text).not.toContain('## Seite');
    expect(result.text).toContain('Hetzner Online GmbH');
  }, 30_000);
});

describe('applyTablePages — Kappung', () => {
  const direct = {
    text: '## Seite 1\n\nText',
    pageCount: 30,
    method: 'pdfjs-dist' as const,
    tablePages: Array.from({ length: 21 }, (_, i) => i + 1),
  };

  it('schickt bei mehr als 20 Tabellenseiten die ganze Datei an Mistral OCR', async () => {
    const wholeFile = vi.fn().mockResolvedValue(ocrResult('## Seite 1\n\nganz'));
    const { result, provider } = await service['applyTablePages'](
      direct,
      () => Promise.resolve('b64'),
      wholeFile
    );
    expect(wholeFile).toHaveBeenCalledOnce();
    expect(mistral.extractPagesWithMistralOCR).not.toHaveBeenCalled();
    expect(provider).toBe('mistral-ocr');
    expect(result.text).toBe('## Seite 1\n\nganz');
  });

  it('behält den pdfjs-Text, wenn auch das scheitert', async () => {
    const wholeFile = vi.fn().mockRejectedValue(new Error('timeout'));
    const { result, provider } = await service['applyTablePages'](
      direct,
      () => Promise.resolve('b64'),
      wholeFile
    );
    expect(provider).toBe('pdfjs-direct');
    expect(result.text).toBe(direct.text);
  });
});
