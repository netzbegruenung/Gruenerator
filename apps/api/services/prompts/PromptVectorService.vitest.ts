/**
 * A trashed prompt keeps its Qdrant point until the purge, so the vector
 * searches check their hits against Postgres before they hand them out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LIVE = '33333333-3333-4333-8333-333333333333';
const TRASHED = '44444444-4444-4444-8444-444444444444';

const hit = (id: string) => ({
  score: 0.9,
  payload: { prompt_id: id, user_id: 'u2', name: id, slug: id, is_public: true },
});
const liveCheck = vi.fn(async (_sql: string, _params: unknown[]) => [{ id: LIVE }]);

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ ensureInitialized: async () => {}, query: liveCheck }),
}));
vi.mock('../../database/services/QdrantService.js', () => ({
  getQdrantInstance: () => ({
    init: async () => {},
    isAvailableSync: () => true,
    client: { query: async () => ({ points: [hit(LIVE), hit(TRASHED)] }) },
  }),
}));
vi.mock('../mistral/index.js', () => ({
  mistralEmbeddingService: { init: async () => {}, generateEmbedding: async () => [0.1] },
}));

const { PromptVectorService } = await import('./PromptVectorService.js');

beforeEach(() => liveCheck.mockClear());

describe('prompt vector search and the Papierkorb', () => {
  it.each([
    [
      'own prompts',
      (s: InstanceType<typeof PromptVectorService>) => s.searchUserPrompts('u1', 'x'),
    ],
    ['public prompts', (s: InstanceType<typeof PromptVectorService>) => s.searchPublicPrompts('x')],
  ])('%s: drops hits of a trashed prompt', async (_name, search) => {
    const out = await search(new PromptVectorService());
    expect(out.search_type).toBe('vector');
    expect(out.results.map((r) => r.prompt_id)).toEqual([LIVE]);
    expect(liveCheck.mock.calls[0]?.[0]).toContain('deleted_at IS NULL');
    expect(liveCheck.mock.calls[0]?.[1]).toEqual([[LIVE, TRASHED]]);
  });
});
