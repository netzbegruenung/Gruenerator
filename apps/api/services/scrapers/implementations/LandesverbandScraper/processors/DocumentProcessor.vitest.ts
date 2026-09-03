/**
 * Der `unchanged`-Zweig ist die Stelle, an der das Sparen scheitern kann.
 *
 * Ein PDF, dessen Text sich nicht geändert hat, wird nicht neu geschrieben —
 * damit landete bis hierher auch der Datei-Fingerprint des Aufrufers nie am
 * Punkt. Beim ersten Lauf nach dem Deploy trägt kein einziger Punkt einen
 * Fingerprint; ohne das Nachtragen bliebe es dabei und jedes PDF würde in jeder
 * Nacht erneut heruntergeladen und ausgelesen. Genau das prüfen die Fälle hier.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const scrollDocuments = vi.fn();
const batchDelete = vi.fn();
const batchUpsert = vi.fn();
const setPayload = vi.fn();

vi.mock('../../../../../database/services/QdrantService/operations/batchOperations.js', () => ({
  scrollDocuments: (...args: unknown[]) => scrollDocuments(...args),
  batchDelete: (...args: unknown[]) => batchDelete(...args),
  batchUpsert: (...args: unknown[]) => batchUpsert(...args),
  setPayload: (...args: unknown[]) => setPayload(...args),
}));

vi.mock('../../../../ChunkQualityService/index.js', () => ({
  chunkQualityService: { calculateQualityScore: () => 1 },
}));

vi.mock('../../../../document-services/index.js', () => ({
  smartChunkDocument: (text: string) => Promise.resolve([{ text }]),
  buildEmbeddingTextsForChunks: (chunks: Array<{ text: string }>) => chunks.map((c) => c.text),
  structurePayload: () => ({
    heading_path: null,
    heading: null,
    chunk_type: 'text',
    section_index: null,
  }),
}));

vi.mock('../../../../mistral/index.js', () => ({
  mistralEmbeddingService: {
    generateBatchEmbeddings: (texts: string[]) => Promise.resolve(texts.map(() => [0.1, 0.2])),
  },
}));

vi.mock('../../../syncEventRecorder.js', () => ({
  recordSyncEvent: () => undefined,
  toExcerpt: (t: string) => t.slice(0, 10),
}));

const { DocumentProcessor } = await import('./DocumentProcessor.js');

const SOURCE = {
  id: 'be',
  name: 'Grüne Berlin',
  shortName: 'BE',
  type: 'landesverband',
} as unknown as Parameters<InstanceType<typeof DocumentProcessor>['processAndStoreDocument']>[0];

const URL_UNDER_TEST = 'https://gruene-berlin.de/beschluss.pdf';
const TEXT = 'Ein Beschlusstext, lang genug für die 100-Zeichen-Schranke. '.repeat(3);

function makeProcessor() {
  return new DocumentProcessor(
    {} as never,
    'landesverbaende_documents',
    (t: string) => `hash:${t.length}`,
    (_url: string, i: number) => i,
    { batchSize: 10 }
  );
}

const store = (fingerprint?: Record<string, unknown>) =>
  makeProcessor().processAndStoreDocument(
    SOURCE,
    'beschluss',
    URL_UNDER_TEST,
    { title: 'Beschluss', text: TEXT, publishedAt: null, categories: [] },
    'landesverbaende_documents',
    10,
    fingerprint
  );

beforeEach(() => {
  vi.clearAllMocks();
  batchUpsert.mockResolvedValue(undefined);
  batchDelete.mockResolvedValue(undefined);
  setPayload.mockResolvedValue(undefined);
});

describe('processAndStoreDocument — unchanged text', () => {
  it('backfills a fingerprint the stored point does not have yet', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: `hash:${TEXT.length}`, indexed_at: '2026-08-01T00:00:00.000Z' } },
    ]);

    const result = await store({ file_hash: 'abc123', source_etag: '"v1"' });

    expect(result).toEqual({ stored: false, reason: 'unchanged' });
    expect(batchUpsert).not.toHaveBeenCalled();
    expect(setPayload).toHaveBeenCalledWith(
      expect.anything(),
      'landesverbaende_documents',
      { file_hash: 'abc123', source_etag: '"v1"' },
      { must: [{ key: 'source_url', match: { value: URL_UNDER_TEST } }] }
    );
  });

  it('patches only the keys that actually moved', async () => {
    scrollDocuments.mockResolvedValue([
      {
        payload: {
          content_hash: `hash:${TEXT.length}`,
          file_hash: 'abc123',
          source_etag: '"v1"',
        },
      },
    ]);

    await store({ file_hash: 'abc123', source_etag: '"v2"' });

    expect(setPayload).toHaveBeenCalledWith(
      expect.anything(),
      'landesverbaende_documents',
      { source_etag: '"v2"' },
      expect.anything()
    );
  });

  it('writes nothing when the stored fingerprint already matches', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: `hash:${TEXT.length}`, file_hash: 'abc123' } },
    ]);

    await store({ file_hash: 'abc123' });

    expect(setPayload).not.toHaveBeenCalled();
  });

  it('stays a no-op for callers that pass no fingerprint', async () => {
    scrollDocuments.mockResolvedValue([{ payload: { content_hash: `hash:${TEXT.length}` } }]);

    await store(undefined);

    expect(setPayload).not.toHaveBeenCalled();
  });
});

describe('processAndStoreDocument — changed text', () => {
  it('carries the fingerprint into the freshly written points', async () => {
    scrollDocuments.mockResolvedValue([]);

    const result = await store({ file_hash: 'abc123' });

    expect(result.stored).toBe(true);
    expect(setPayload).not.toHaveBeenCalled();
    const [, , points] = batchUpsert.mock.calls[0] as [unknown, string, { payload: unknown }[]];
    expect(points[0].payload).toMatchObject({ file_hash: 'abc123' });
  });
});
