/**
 * Which facets the notebook CHAT surface offers.
 *
 * There are two filter endpoints over the same `filterableFields` registry, and
 * they feed different surfaces: `research.filters` feeds the manual research
 * (web + mobile), where facet values are rendered as a visible, pickable chip
 * list; `notebook.getFilters` (here) feeds the chat's filter menu, where a
 * chosen value then narrows every following answer without being visible.
 *
 * The `persons` facet belongs to the first only. Its values are raw spaCy NER
 * output — useful when you can read the list, misleading when a chat turn
 * carries one silently. `FilterableField.researchOnly` marks that, and this
 * test locks that the chat endpoint honours it.
 *
 * Run: `pnpm --filter @gruenerator/api exec vitest run routes/notebook/chatFiltersExcludePersons.vitest.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQdrant = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  getFieldValueCounts: vi.fn(async (..._args: unknown[]) => [{ value: 'klima', count: 3 }]),
  getDateRange: vi.fn(async () => ({ min: '2020-01-01', max: '2026-01-01' })),
}));
vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => mockQdrant,
}));

// An in-memory stand-in, so whether a test sees the cache never depends on a
// redis that happens to run on the machine.
const cacheStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(async (key: string) => cacheStore.get(key) ?? null),
  setCachedJson: vi.fn(async (key: string, value: unknown) => {
    cacheStore.set(key, value);
  }),
}));

// Heavy modules the router imports but getFilters never touches.
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return {};
  },
}));
vi.mock('../../services/document-services/index.js', () => ({
  getQdrantDocumentService: vi.fn(),
}));
vi.mock('../../services/notebook/index.js', () => ({ notebookQAService: {} }));
vi.mock('../../services/notebook/notebookStatsService.js', () => ({
  getNotebookStats: vi.fn(),
}));
vi.mock('../../services/usage/ItemUsageService.js', () => ({
  recordItemUsageSafe: vi.fn(),
}));

import { getCollectionFilterableFields } from '../../config/systemCollectionsConfig.js';

import { notebookContractRouter } from './notebookContractRouter.js';

const callGetFilters = (id: string) =>
  (
    notebookContractRouter.getFilters as (args: unknown) => Promise<{
      status: number;
      body: { filters?: Record<string, unknown> };
    }>
  )({ params: { id } });

beforeEach(() => {
  cacheStore.clear();
});

describe('notebook.getFilters — the chat surface', () => {
  it('omits the research-only person facet but keeps themes', async () => {
    const res = await callGetFilters('grundsatz-system');

    expect(res.status).toBe(200);
    const fields = Object.keys(res.body.filters ?? {});
    expect(fields).not.toContain('persons');
    expect(fields).toContain('themes');
  });

  it('does not even query Qdrant for the omitted facet', async () => {
    // Not just cosmetic: faceting `persons` is the expensive one of the two,
    // and the chat surface fetches filters on every notebook open.
    mockQdrant.getFieldValueCounts.mockClear();

    await callGetFilters('grundsatz-system');

    const queried = mockQdrant.getFieldValueCounts.mock.calls.map((c) => c[1]);
    expect(queried).not.toContain('persons');
  });

  it('counts documents, not chunks (#3694)', async () => {
    mockQdrant.getFieldValueCounts.mockClear();

    await callGetFilters('hamburg-system');

    const filters = mockQdrant.getFieldValueCounts.mock.calls.map((c) => c[3]);
    expect(filters.length).toBeGreaterThan(0);
    for (const filter of filters) {
      expect(filter).toEqual({
        must: [
          { key: 'chunk_index', match: { value: 0 } },
          { key: 'landesverband', match: { value: 'HH' } },
        ],
      });
    }
  });

  it('leaves the registry itself untouched, so manual research still sees it', async () => {
    // `research.filters` reads the same registry unfiltered — if the facet were
    // dropped there, this would be a removal instead of a split.
    const registered = getCollectionFilterableFields('grundsatz-system').map((f) => f.field);
    expect(registered).toContain('persons');
  });
});

describe('notebook.getFilters — cache', () => {
  it('answers a second open from the cache without touching Qdrant', async () => {
    const first = await callGetFilters('grundsatz-system');
    mockQdrant.getFieldValueCounts.mockClear();
    mockQdrant.getDateRange.mockClear();

    const second = await callGetFilters('grundsatz-system');

    expect(second.body).toEqual(first.body);
    expect(mockQdrant.getFieldValueCounts).not.toHaveBeenCalled();
    expect(mockQdrant.getDateRange).not.toHaveBeenCalled();
  });

  it('does not keep an answer in which a field failed', async () => {
    mockQdrant.getFieldValueCounts.mockRejectedValueOnce(new Error('qdrant down'));

    const res = await callGetFilters('grundsatz-system');

    expect(res.status).toBe(200);
    expect(cacheStore.size).toBe(0);
  });
});
