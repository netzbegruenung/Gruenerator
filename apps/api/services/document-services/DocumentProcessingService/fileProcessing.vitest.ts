/**
 * Ein Text pro hochgeladener Datei.
 *
 * Der Chat-Pfad extrahiert den Text bereits, bevor er hier ankommt
 * (`processAttachments` → `extractTextFromBase64` → Mistral OCR). Ohne den
 * `knownText`-Parameter lief dieselbe Datei danach ein zweites Mal durch eine
 * ANDERE Kette: `extractDocumentFromFile` → `extractTextFromDocument` prüft die
 * Direkt-Lesbarkeit vorweg und nimmt bei einem Text-PDF PDF.js.
 *
 * Die zwei Fassungen sind nicht bloss zwei Zeichenzahlen. Indiziert — und damit
 * zitiert — wurde immer die PDF.js-Fassung, und die plättet eine Tabelle in eine
 * durchgehende Zeile: gemessen am 24.08.2026 an der Löschfristen-Tabelle waren
 * sämtliche Zeilengrenzen weg („… max. 24 Stunden Benutzerprofile Bis zur …").
 * Das Modell hat daraus treu, aber falsch rekonstruiert — der Fehler sah wie
 * eine Halluzination aus und sass zwei Ebenen tiefer.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const extractDocumentFromFile = vi.fn();
const extracted = (text: string) => ({ text, pageCount: null, extractionMethod: null });
const chunkAndEmbedText = vi.fn();

vi.mock('./textExtraction.js', async () => {
  const actual = await vi.importActual<typeof import('./textExtraction.js')>('./textExtraction.js');
  return {
    ...actual,
    extractDocumentFromFile: (...args: unknown[]) => extractDocumentFromFile(...args) as unknown,
  };
});

vi.mock('./chunkingPipeline.js', () => ({
  chunkAndEmbedText: (...args: unknown[]) => chunkAndEmbedText(...args) as unknown,
}));

const hasAiConsent = vi.fn(async () => true);
vi.mock('../../../middleware/requireAiConsent.js', () => ({
  hasAiConsent: (...args: unknown[]) => hasAiConsent(...(args as [])),
}));

const { processFileUpload, processUploadedDocument } = await import('./fileProcessing.js');

const file = {
  buffer: Buffer.from('%PDF-1.4 …'),
  mimetype: 'application/pdf',
  originalname: 'datenschutz.pdf',
  size: 10,
};

const saveDocumentMetadata = vi.fn();
const storeDocumentVectors = vi.fn();

const services = () => ({
  pg: { saveDocumentMetadata } as never,
  qdrant: { storeDocumentVectors } as never,
});

beforeEach(() => {
  extractDocumentFromFile.mockReset();
  chunkAndEmbedText.mockReset().mockResolvedValue({ chunks: ['c'], embeddings: [[0.1]] });
  saveDocumentMetadata.mockReset().mockResolvedValue({ id: 'doc-1', title: 'datenschutz.pdf' });
  storeDocumentVectors.mockReset().mockResolvedValue(undefined);
});

describe('processFileUpload — knownText', () => {
  it('extrahiert nicht noch einmal, wenn der Text schon vorliegt', async () => {
    const { pg, qdrant } = services();
    const bekannt = '| Datenart | Speicherdauer |\n| --- | --- |\n| Server-Logs | 7 Tage |';

    await processFileUpload(pg, qdrant, 'u1', file, 'datenschutz.pdf', 'documentchat', bekannt);

    expect(extractDocumentFromFile).not.toHaveBeenCalled();
    // …und indiziert wird genau dieser Text, nicht ein zweiter.
    expect(chunkAndEmbedText.mock.calls[0]?.[0]).toBe(bekannt);
  });

  it('extrahiert weiterhin selbst, wo kein Text mitkommt', async () => {
    // Der Notebook-Upload und die Skripte reichen nichts durch — für sie darf
    // sich nichts ändern.
    const { pg, qdrant } = services();
    extractDocumentFromFile.mockResolvedValue(extracted('aus der Datei gelesen'));

    await processFileUpload(pg, qdrant, 'u1', file, 'datenschutz.pdf');

    expect(extractDocumentFromFile).toHaveBeenCalledOnce();
    expect(chunkAndEmbedText.mock.calls[0]?.[0]).toBe('aus der Datei gelesen');
  });

  it('fällt auf die eigene Extraktion zurück, wenn der mitgereichte Text leer ist', async () => {
    // Ein leerer Anhangstext ist ein Fehlschlag weiter oben, kein Auftrag,
    // nichts zu indizieren.
    const { pg, qdrant } = services();
    extractDocumentFromFile.mockResolvedValue(extracted('aus der Datei gelesen'));

    await processFileUpload(pg, qdrant, 'u1', file, 'datenschutz.pdf', 'documentchat', '   ');

    expect(extractDocumentFromFile).toHaveBeenCalledOnce();
    expect(chunkAndEmbedText.mock.calls[0]?.[0]).toBe('aus der Datei gelesen');
  });
});

describe('processFileUpload — knownPageCount', () => {
  it('speichert die Seitenzahl aus der Anhangs-Extraktion', async () => {
    const { pg, qdrant } = services();

    await processFileUpload(
      pg,
      qdrant,
      'u1',
      file,
      'datenschutz.pdf',
      'documentchat',
      '## Seite 1\n\nPräambel',
      8
    );

    expect(extractDocumentFromFile).not.toHaveBeenCalled();
    expect(saveDocumentMetadata).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ pageCount: 8 })
    );
  });

  it('lässt page_count weg, wenn keine Seitenzahl mitkommt', async () => {
    const { pg, qdrant } = services();

    await processFileUpload(pg, qdrant, 'u1', file, 'notiz.docx', 'documentchat', 'Text');

    expect(saveDocumentMetadata.mock.calls[0]?.[1]).not.toHaveProperty('pageCount');
  });
});

describe('processUploadedDocument — Art.-9-Einwilligung', () => {
  it('liest ohne Einwilligung nichts aus und verbucht den Grund am Dokument', async () => {
    hasAiConsent.mockResolvedValueOnce(false);
    const updateDocumentMetadata = vi.fn().mockResolvedValue(undefined);
    const getDocumentById = vi.fn();

    await expect(
      processUploadedDocument(
        { updateDocumentMetadata, getDocumentById } as never,
        { storeDocumentVectors } as never,
        'doc-1',
        'u1'
      )
    ).rejects.toThrow(/Einwilligung/);

    expect(hasAiConsent).toHaveBeenCalledWith('u1');
    expect(getDocumentById).not.toHaveBeenCalled();
    expect(extractDocumentFromFile).not.toHaveBeenCalled();
    expect(chunkAndEmbedText).not.toHaveBeenCalled();
    expect(updateDocumentMetadata).toHaveBeenCalledWith(
      'doc-1',
      'u1',
      expect.objectContaining({
        status: 'failed',
        additionalMetadata: expect.objectContaining({
          processing_error: expect.stringContaining('Einwilligung'),
        }),
      })
    );
  });
});

describe('Seitenzahlen — nur der Dokument-Ingest setzt Marken', () => {
  it('processFileUpload liest mit Marken und speichert page_count und Methode', async () => {
    const { pg, qdrant } = services();
    extractDocumentFromFile.mockResolvedValue({
      text: '## Seite 1\n\nPräambel',
      pageCount: 7,
      extractionMethod: 'pdfjs-direct',
    });

    await processFileUpload(pg, qdrant, 'u1', file, 'antrag.pdf');

    expect(extractDocumentFromFile).toHaveBeenCalledWith(file, { pageMarkers: true });
    expect(saveDocumentMetadata).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        pageCount: 7,
        markdownContent: '## Seite 1\n\nPräambel',
        additionalMetadata: expect.objectContaining({
          extractionMethod: 'pdfjs-direct',
          content_preview: 'Präambel',
        }),
      })
    );
  });

  it('processUploadedDocument schreibt page_count und Methode an die Zeile', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-'));
    const filePath = path.join(dir, 'antrag.pdf');
    fs.writeFileSync(filePath, '%PDF-1.4');
    extractDocumentFromFile.mockResolvedValue({
      text: '## Seite 2\n\nBeschluss',
      pageCount: 3,
      extractionMethod: 'mistral-ocr',
    });
    const updateDocumentMetadata = vi.fn().mockResolvedValue(undefined);
    const getDocumentById = vi.fn().mockResolvedValue({
      id: 'doc-1',
      title: 'Antrag',
      filename: 'antrag.pdf',
      source_type: 'manual',
      metadata: { filePath, mimetype: 'application/pdf' },
    });

    await processUploadedDocument(
      { updateDocumentMetadata, getDocumentById } as never,
      { storeDocumentVectors } as never,
      'doc-1',
      'u1'
    );

    expect(extractDocumentFromFile.mock.calls[0]?.[1]).toEqual({ pageMarkers: true });
    expect(updateDocumentMetadata).toHaveBeenCalledWith(
      'doc-1',
      'u1',
      expect.objectContaining({
        status: 'completed',
        pageCount: 3,
        additionalMetadata: expect.objectContaining({ extractionMethod: 'mistral-ocr' }),
      })
    );
  });
});
