/**
 * Ein Text pro hochgeladener Datei.
 *
 * Der Chat-Pfad extrahiert den Text bereits, bevor er hier ankommt
 * (`processAttachments` → `extractTextFromBase64` → Mistral OCR). Ohne den
 * `knownText`-Parameter lief dieselbe Datei danach ein zweites Mal durch eine
 * ANDERE Kette: `extractTextFromFile` → `extractTextFromDocument` prüft die
 * Direkt-Lesbarkeit vorweg und nimmt bei einem Text-PDF PDF.js.
 *
 * Die zwei Fassungen sind nicht bloss zwei Zeichenzahlen. Indiziert — und damit
 * zitiert — wurde immer die PDF.js-Fassung, und die plättet eine Tabelle in eine
 * durchgehende Zeile: gemessen am 24.08.2026 an der Löschfristen-Tabelle waren
 * sämtliche Zeilengrenzen weg („… max. 24 Stunden Benutzerprofile Bis zur …").
 * Das Modell hat daraus treu, aber falsch rekonstruiert — der Fehler sah wie
 * eine Halluzination aus und sass zwei Ebenen tiefer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const extractTextFromFile = vi.fn();
const chunkAndEmbedText = vi.fn();

vi.mock('./textExtraction.js', async () => {
  const actual = await vi.importActual<typeof import('./textExtraction.js')>('./textExtraction.js');
  return {
    ...actual,
    extractTextFromFile: (...args: unknown[]) => extractTextFromFile(...args) as unknown,
  };
});

vi.mock('./chunkingPipeline.js', () => ({
  chunkAndEmbedText: (...args: unknown[]) => chunkAndEmbedText(...args) as unknown,
}));

const { processFileUpload } = await import('./fileProcessing.js');

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
  extractTextFromFile.mockReset();
  chunkAndEmbedText.mockReset().mockResolvedValue({ chunks: ['c'], embeddings: [[0.1]] });
  saveDocumentMetadata.mockReset().mockResolvedValue({ id: 'doc-1', title: 'datenschutz.pdf' });
  storeDocumentVectors.mockReset().mockResolvedValue(undefined);
});

describe('processFileUpload — knownText', () => {
  it('extrahiert nicht noch einmal, wenn der Text schon vorliegt', async () => {
    const { pg, qdrant } = services();
    const bekannt = '| Datenart | Speicherdauer |\n| --- | --- |\n| Server-Logs | 7 Tage |';

    await processFileUpload(pg, qdrant, 'u1', file, 'datenschutz.pdf', 'documentchat', bekannt);

    expect(extractTextFromFile).not.toHaveBeenCalled();
    // …und indiziert wird genau dieser Text, nicht ein zweiter.
    expect(chunkAndEmbedText.mock.calls[0]?.[0]).toBe(bekannt);
  });

  it('extrahiert weiterhin selbst, wo kein Text mitkommt', async () => {
    // Der Notizbuch-Upload und die Skripte reichen nichts durch — für sie darf
    // sich nichts ändern.
    const { pg, qdrant } = services();
    extractTextFromFile.mockResolvedValue('aus der Datei gelesen');

    await processFileUpload(pg, qdrant, 'u1', file, 'datenschutz.pdf');

    expect(extractTextFromFile).toHaveBeenCalledOnce();
    expect(chunkAndEmbedText.mock.calls[0]?.[0]).toBe('aus der Datei gelesen');
  });

  it('fällt auf die eigene Extraktion zurück, wenn der mitgereichte Text leer ist', async () => {
    // Ein leerer Anhangstext ist ein Fehlschlag weiter oben, kein Auftrag,
    // nichts zu indizieren.
    const { pg, qdrant } = services();
    extractTextFromFile.mockResolvedValue('aus der Datei gelesen');

    await processFileUpload(pg, qdrant, 'u1', file, 'datenschutz.pdf', 'documentchat', '   ');

    expect(extractTextFromFile).toHaveBeenCalledOnce();
    expect(chunkAndEmbedText.mock.calls[0]?.[0]).toBe('aus der Datei gelesen');
  });
});
