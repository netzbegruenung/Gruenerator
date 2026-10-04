import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchUpsert = vi.fn();
vi.mock('../../../database/services/QdrantService/operations/batchOperations.js', () => ({
  batchUpsert: (...args: unknown[]) => batchUpsert(...args),
}));
vi.mock('../../mistral/index.js', () => ({
  mistralEmbeddingService: {
    generateBatchEmbeddings: async (texts: string[]) => texts.map(() => [0.1, 0.2]),
  },
}));

const { writeParent } = await import('./parentStore.js');

const calls: string[] = [];
const client = {
  scroll: vi.fn(async () => ({ points: [{ id: 'old' }], next_page_offset: null })),
  setPayload: vi.fn(async (_c: string, body: { payload: Record<string, unknown> }) => {
    calls.push(`setPayload ${JSON.stringify(body.payload)}`);
  }),
  delete: vi.fn(async () => {
    calls.push('delete');
  }),
};
const config = {
  collection: 'c',
  source: 's',
  pointId: (documentId: string, chunkIndex: number) => `${documentId}#${chunkIndex}`,
  commitKeys: ['content_hash'],
};
const parent = {
  parentId: 'p',
  units: [
    {
      documentId: 'd',
      title: 'Titel',
      headingPath: ['Titel'],
      text: 'Ein kurzer Absatz, der in einen Chunk passt.',
      sourceUrl: 'https://example.org',
      payload: { content_hash: 'h1' },
    },
  ],
};

describe('writeParent', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    batchUpsert.mockImplementation(
      async (_c: unknown, _col: string, points: Array<{ payload: Record<string, unknown> }>) => {
        calls.push(`upsert content_hash=${String(points[0].payload.content_hash)}`);
      }
    );
  });

  it('setzt den Hash erst, wenn alle Punkte stehen und die alten weg sind', async () => {
    await writeParent(client as never, config, parent);
    expect(calls).toEqual([
      'setPayload {"content_hash":null}',
      'upsert content_hash=null',
      'delete',
      'setPayload {"content_hash":"h1"}',
    ]);
  });

  it('hinterlässt nach einem Abbruch keinen Hash, an dem der Scraper die Quelle überspränge', async () => {
    batchUpsert.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(writeParent(client as never, config, parent)).rejects.toThrow('fetch failed');
    expect(calls).toEqual(['setPayload {"content_hash":null}']);
  });
});
