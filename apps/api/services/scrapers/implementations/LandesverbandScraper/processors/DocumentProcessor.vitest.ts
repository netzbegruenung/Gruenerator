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
  embeddingPayload: () => ({ embedding_model: 'mistral-embed' }),
  offsetPayload: () => ({ char_start: null, char_end: null }),
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

const storeWith = (content: { title?: string; publishedAt?: string | null }) =>
  makeProcessor().processAndStoreDocument(
    SOURCE,
    'beschluss',
    URL_UNDER_TEST,
    { title: 'Beschluss', text: TEXT, publishedAt: null, categories: [], ...content },
    'landesverbaende_documents',
    10
  );

beforeEach(() => {
  vi.clearAllMocks();
  batchUpsert.mockResolvedValue(undefined);
  batchDelete.mockResolvedValue(undefined);
  setPayload.mockResolvedValue(undefined);
});

describe('processAndStoreDocument — unchanged text', () => {
  const HASH = `hash:${TEXT.length}`;

  it('backfills a fingerprint the stored point does not have yet', async () => {
    scrollDocuments.mockResolvedValue([
      {
        payload: {
          content_hash: HASH,
          title: 'Beschluss',
          indexed_at: '2026-08-01T00:00:00.000Z',
        },
      },
    ]);

    const result = await store({ file_hash: 'abc123', source_etag: '"v1"' });

    expect(result).toEqual({ stored: false, reason: 'unchanged' });
    expect(batchUpsert).not.toHaveBeenCalled();
    expect(setPayload).toHaveBeenCalledWith(
      expect.anything(),
      'landesverbaende_documents',
      { file_hash: 'abc123', source_etag: '"v1"', checked_at: expect.any(String) },
      { must: [{ key: 'source_url', match: { value: URL_UNDER_TEST } }] }
    );
  });

  it('patches only the keys that actually moved', async () => {
    scrollDocuments.mockResolvedValue([
      {
        payload: {
          content_hash: HASH,
          title: 'Beschluss',
          file_hash: 'abc123',
          source_etag: '"v1"',
        },
      },
    ]);

    await store({ file_hash: 'abc123', source_etag: '"v2"' });

    expect(setPayload).toHaveBeenCalledWith(
      expect.anything(),
      'landesverbaende_documents',
      { source_etag: '"v2"', checked_at: expect.any(String) },
      expect.anything()
    );
  });

  it('writes only checked_at when fingerprint, title and date already match', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss', file_hash: 'abc123' } },
    ]);

    await store({ file_hash: 'abc123' });

    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(setPayload.mock.calls[0][2]).toEqual({ checked_at: expect.any(String) });
  });

  it('writes only checked_at for callers that pass no fingerprint', async () => {
    scrollDocuments.mockResolvedValue([{ payload: { content_hash: HASH, title: 'Beschluss' } }]);

    await store(undefined);

    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(setPayload.mock.calls[0][2]).toEqual({ checked_at: expect.any(String) });
  });

  it('heals a title the extractor now reads differently — in the same single write', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss&nbsp;\nAnrisstext' } },
    ]);

    await store({ file_hash: 'abc123' });

    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(setPayload.mock.calls[0][2]).toEqual({
      file_hash: 'abc123',
      title: 'Beschluss',
      checked_at: expect.any(String),
    });
  });

  it('heals a date the extractor now reads differently', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss', published_at: '2023-06-15' } },
    ]);

    await storeWith({ publishedAt: '2023-04-29' });

    expect(setPayload.mock.calls[0][2]).toEqual({
      published_at: '2023-04-29',
      checked_at: expect.any(String),
    });
  });

  it('never writes an empty title or a null date over a stored one', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss', published_at: '2023-04-29' } },
    ]);

    await storeWith({ title: '', publishedAt: null });

    expect(setPayload.mock.calls[0][2]).toEqual({ checked_at: expect.any(String) });
  });
});

describe('processAndStoreDocument — unchanged text, write budget and date guard', () => {
  const HASH = `hash:${TEXT.length}`;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

  it('skips the write when nothing moved and checked_at is younger than 24h', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss', checked_at: hoursAgo(2) } },
    ]);

    await store(undefined);

    expect(setPayload).not.toHaveBeenCalled();
  });

  it('refreshes checked_at when nothing moved but it is older than 24h', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss', checked_at: hoursAgo(25) } },
    ]);

    await store(undefined);

    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(setPayload.mock.calls[0][2]).toEqual({ checked_at: expect.any(String) });
  });

  it('still writes a real change even when checked_at is fresh', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss', checked_at: hoursAgo(2) } },
    ]);

    await store({ file_hash: 'abc123' });

    expect(setPayload.mock.calls[0][2]).toEqual({
      file_hash: 'abc123',
      checked_at: expect.any(String),
    });
  });

  it('never downgrades a stored date to the -06-15 year-only guess', async () => {
    scrollDocuments.mockResolvedValue([
      { payload: { content_hash: HASH, title: 'Beschluss', published_at: '2023-04-29' } },
    ]);

    await storeWith({ publishedAt: '2023-06-15' });

    expect(setPayload.mock.calls[0][2]).toEqual({ checked_at: expect.any(String) });
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

  it('stamps checked_at next to indexed_at on a normal store', async () => {
    scrollDocuments.mockResolvedValue([]);

    await store(undefined);

    const [, , points] = batchUpsert.mock.calls[0] as [
      unknown,
      string,
      { payload: Record<string, unknown> }[],
    ];
    expect(points[0].payload.checked_at).toEqual(expect.any(String));
    expect(points[0].payload.checked_at).toBe(points[0].payload.indexed_at);
  });
});

/**
 * `maxAgeYears` is optional and three sources leave it unset, so this default
 * is what actually decides their content. It is also the seam the pre-fetch
 * rejected-URL gate has to match: while that gate required an explicitly
 * configured limit, it cached those sources' rejections and never read them
 * back — inert exactly where no counter could reveal it. Both sides now read
 * DEFAULT_MAX_AGE_YEARS; these cases pin what it means here.
 */
describe('processAndStoreDocument — default age limit', () => {
  const yearsAgo = (years: number) =>
    new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000).toISOString();

  /** Exactly how the scraper calls it for a source without the field set. */
  const storeAged = (publishedAt: string) =>
    makeProcessor().processAndStoreDocument(
      SOURCE,
      'beschluss',
      URL_UNDER_TEST,
      { title: 'Beschluss', text: TEXT, publishedAt, categories: [] },
      'landesverbaende_documents',
      undefined
    );

  beforeEach(() => {
    scrollDocuments.mockResolvedValue([]);
  });

  it('rejects content past the default window', async () => {
    await expect(storeAged(yearsAgo(12))).resolves.toEqual({ stored: false, reason: 'too_old' });
  });

  it('still stores content inside it', async () => {
    const result = await storeAged(yearsAgo(5));

    // Guards the other direction: a default of 0 would make the case above
    // pass too, while quietly rejecting everything.
    expect(result.stored).toBe(true);
  });
});
