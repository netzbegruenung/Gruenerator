/**
 * `textSearch`/`hybridSearch` serve only the "my documents" search. A
 * `documentIds`-scoped search drops the `user_id` pin in `searchOperations`
 * (notebook callers pass ids authorized for other owners), so these two
 * wrappers put it back: a scoped search must still find only the caller's
 * own documents.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QdrantFilter } from './types.js';

const performTextSearch = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => []));
const qdrant = vi.hoisted(() => ({
  client: {} as unknown,
  isConnected: true,
  init: vi.fn(async () => {}),
  operations: { performTextSearch },
}));

vi.mock('../../../database/services/QdrantService.js', () => ({
  getQdrantInstance: () => qdrant,
}));

vi.mock('../trashedDocuments.js', () => ({
  trashedDocumentIds: vi.fn(async () => new Set()),
  withoutTrashedDocuments: vi.fn(async (ids: string[]) => ids),
}));

const { DocumentSearchService } = await import('./DocumentSearchService.js');

const OWNER_PIN = { key: 'user_id', match: { value: 'user-1' } };

afterEach(() => {
  performTextSearch.mockClear();
  vi.restoreAllMocks();
});

describe('DocumentSearchService owner pin on scoped searches', () => {
  it('textSearch keeps user_id when scoped by documentIds', async () => {
    const service = new DocumentSearchService();

    await service.textSearch('Klima', 'user-1', { documentIds: ['doc-foreign'] });

    const filter = performTextSearch.mock.calls[0]?.[2] as QdrantFilter;
    expect(filter.must).toContainEqual(OWNER_PIN);
    expect(filter.must).toContainEqual({
      key: 'document_id',
      match: { any: ['doc-foreign'] },
    });
  });

  it('textSearch without documentIds keeps the single owner pin', async () => {
    const service = new DocumentSearchService();

    await service.textSearch('Klima', 'user-1', {});

    const filter = performTextSearch.mock.calls[0]?.[2] as QdrantFilter;
    expect(filter.must?.filter((c) => 'key' in c && c.key === 'user_id')).toHaveLength(1);
  });

  it('hybridSearch passes the owner pin when scoped by documentIds', async () => {
    const service = new DocumentSearchService();
    const performHybridSearch = vi.spyOn(service, 'performHybridSearch').mockResolvedValue({
      success: true,
      results: [],
      query: 'Klima',
      searchType: 'hybrid',
      message: '',
    });

    await service.hybridSearch('Klima', 'user-1', { documentIds: ['doc-foreign'] });

    const params = performHybridSearch.mock.calls[0]?.[0] as {
      filters: { additionalFilter?: QdrantFilter };
    };
    expect(params.filters.additionalFilter?.must).toContainEqual(OWNER_PIN);
  });
});
