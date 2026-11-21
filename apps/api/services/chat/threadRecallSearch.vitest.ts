import { beforeEach, describe, expect, it, vi } from 'vitest';

const vectorSearch = vi.fn(async () => [{ payload: { thread_id: 't1' } }]);

vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: () => ({}) }));
vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: async () => {},
    isAvailable: () => true,
    operations: { vectorSearch },
  }),
}));
vi.mock('../mistral/index.js', () => ({
  mistralEmbeddingService: {
    init: async () => {},
    generateQueryEmbedding: async () => [0.1],
  },
}));

const { searchThreadRecall } = await import('./threadRecallEmbeddingService.js');

const filterOf = () => (vectorSearch.mock.calls[0] as unknown[])[2];

describe('searchThreadRecall filter', () => {
  beforeEach(() => vectorSearch.mockClear());

  it('stays own-chats-only without a scope list', async () => {
    await searchThreadRecall('u1', 'q', 3);
    expect(filterOf()).toEqual({ must: [{ key: 'user_id', match: { value: 'u1' } }] });
  });

  it('matches on the authorised id list, without user_id, when scoped', async () => {
    await searchThreadRecall('u1', 'q', 3, ['t1', 't2']);
    expect(filterOf()).toEqual({ must: [{ key: 'thread_id', match: { any: ['t1', 't2'] } }] });
  });

  it('an empty list is not a scope', async () => {
    await searchThreadRecall('u1', 'q', 3, []);
    expect(filterOf()).toEqual({ must: [{ key: 'user_id', match: { value: 'u1' } }] });
  });
});
