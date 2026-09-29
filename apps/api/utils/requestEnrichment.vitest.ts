import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    query,
  }),
}));

type Module = typeof import('./requestEnrichment.js');
let RequestEnricher: Module['RequestEnricher'];
let enrichRequest: Module['enrichRequest'];

beforeAll(async () => {
  ({ RequestEnricher, enrichRequest } = await import('./requestEnrichment.js'));
});

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue([
    { id: 't1', title: 'Mein Text', content: 'Inhalt', document_type: 'text', word_count: 1 },
  ]);
});

describe('fetchTextsByIds', () => {
  it('scopes the query to the requesting user', async () => {
    const result = await new RequestEnricher().fetchTextsByIds(['t1'], { user: { id: 'u1' } });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('user_id = $2');
    expect(params).toEqual([['t1'], 'u1']);
    expect(result.knowledge).toHaveLength(1);
  });

  it('does not query without a user', async () => {
    const result = await new RequestEnricher().fetchTextsByIds(['t1'], null);

    expect(query).not.toHaveBeenCalled();
    expect(result).toEqual({ knowledge: [], textReferences: [] });
  });
});

describe('enrichRequest', () => {
  it('forwards the request so selected texts are fetched for its user', async () => {
    await enrichRequest(
      { selectedTextIds: ['t1'] },
      { enableUrls: false, selectedTextIds: ['t1'] },
      { user: { id: 'u1' }, headers: {} }
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([['t1'], 'u1']);
  });
});
