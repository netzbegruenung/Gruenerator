import { afterEach, describe, expect, it, vi } from 'vitest';

import { COLLECTION_SCHEMAS, NLP_FACET_INDEXES } from '../../config/qdrantCollectionsSchema.js';
import {
  alreadyEnriched,
  ENRICHMENT_COLLECTIONS,
  enrichCollection,
  NLP_VERSION,
} from './notebookEnrichmentService.js';

const { client, nlp } = vi.hoisted(() => ({
  client: {
    getCollection: vi.fn(),
    createPayloadIndex: vi.fn(),
    scroll: vi.fn(),
    setPayload: vi.fn(),
  },
  nlp: {
    classifyArticlesBatched: vi.fn(),
    extractPersons: vi.fn(),
    getPersonsVersion: vi.fn(),
  },
}));

vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({ init: () => Promise.resolve(), client }),
}));
vi.mock('../nlp/nlpClient.js', () => nlp);

const enriched = {
  nlp_enriched_at: '2026-09-27T02:00:00.000Z',
  nlp_version: NLP_VERSION,
  content_hash: 'abc',
  nlp_content_hash: 'abc',
};

describe('alreadyEnriched', () => {
  it('skips a document stamped with the running persons version', () => {
    expect(alreadyEnriched({ ...enriched, nlp_persons_version: 1 }, 1)).toBe(true);
  });

  it('re-tags a document once the service reports newer person rules', () => {
    expect(alreadyEnriched({ ...enriched, nlp_persons_version: 1 }, 2)).toBe(false);
  });

  it('re-tags a document stamped before the service reported a version', () => {
    // Every payload written up to #3695 — the ones carrying photographer names.
    expect(alreadyEnriched(enriched, 1)).toBe(false);
  });

  it('does not churn while the running service predates the version field', () => {
    expect(alreadyEnriched({ ...enriched, nlp_persons_version: null }, null)).toBe(true);
    expect(alreadyEnriched(enriched, null)).toBe(true);
  });

  it('still re-tags on changed content', () => {
    expect(
      alreadyEnriched({ ...enriched, nlp_persons_version: 1, content_hash: 'changed' }, 1)
    ).toBe(false);
  });
});

function sixtyDueDocsAtOneMinutePerBatch(): void {
  vi.useFakeTimers({ now: 0 });
  const points = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    payload: { source_url: `https://example.org/${i}`, full_text: 'Text' },
  }));
  client.scroll.mockResolvedValue({ points, next_page_offset: null });
  nlp.getPersonsVersion.mockResolvedValue(1);
  nlp.extractPersons.mockResolvedValue([]);
  nlp.classifyArticlesBatched.mockImplementation((docs: Array<{ id: string }>) => {
    vi.advanceTimersByTime(60_000);
    return Promise.resolve(docs.map((d) => ({ id: d.id, topics: {}, topNouns: [] })));
  });
}

describe('enrichCollection time budget', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stops starting NLP batches once the clock runs out and reports the rest as pending', async () => {
    // Every batch of 15 costs a minute, so the 3-minute budget affords three.
    sixtyDueDocsAtOneMinutePerBatch();

    const stats = await enrichCollection('landesverbaende_documents', { mode: 'missing' });

    expect(stats.enriched).toBe(45);
    expect(stats.pending).toBe(15);
    expect(nlp.classifyArticlesBatched).toHaveBeenCalledTimes(3);
  });

  it('leaves an uncapped run (maxDocs: 0, the backfill script) without a clock', async () => {
    sixtyDueDocsAtOneMinutePerBatch();

    const stats = await enrichCollection('landesverbaende_documents', { maxDocs: 0 });

    expect(stats.enriched).toBe(60);
    expect(stats.pending).toBe(0);
  });
});

describe('NLP facet indexes in the collection schemas', () => {
  // A copy migration (migrate-bm25-sparse) recreates a collection from its
  // schema; an index only the nightly run creates is gone until that run.
  it.each(ENRICHMENT_COLLECTIONS)('%s declares the facet indexes', (collection) => {
    const fields = COLLECTION_SCHEMAS[collection]?.indexes.map((i) => i.field) ?? [];
    for (const { field } of NLP_FACET_INDEXES) expect(fields).toContain(field);
  });
});
