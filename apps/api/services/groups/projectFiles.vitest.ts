import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const { getProjectFileDocumentIds, PROJECT_FILE_DOCUMENT_CAP } = await import('./projectFiles.js');

describe('getProjectFileDocumentIds', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns every file of the project as one id list, without a per-turn cut', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}` }));
    mockQuery.mockResolvedValue(rows);
    const out = await getProjectFileDocumentIds('thread-1', 'viewer');
    expect(out).toHaveLength(12);
    expect(out[11]).toBe('d11');
  });

  it('lists a document shared twice only once', async () => {
    mockQuery.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }, { id: 'd1' }]);
    expect(await getProjectFileDocumentIds('thread-1', 'viewer')).toEqual(['d1', 'd2']);
  });

  it('binds access to the asking member, the thread owner and the live rows', async () => {
    mockQuery.mockResolvedValue([]);
    await getProjectFileDocumentIds('thread-1', 'viewer');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/group_memberships gm[^]*gm\.user_id = \$2[^]*gm\.is_active = TRUE/);
    expect(sql).toMatch(/t\.user_id::text = \$2::text OR EXISTS[^]*content_type = .chat_threads./);
    expect(sql).toMatch(/t\.deleted_at IS NULL/);
    expect(sql).toMatch(/g\.deleted_at IS NULL/);
    expect(sql).toMatch(/d\.deleted_at IS NULL/);
    expect(sql).toMatch(/d\.status = 'completed'/);
    expect(params).toEqual(['thread-1', 'viewer', PROJECT_FILE_DOCUMENT_CAP]);
  });

  it('returns nothing for a chat outside any project', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await getProjectFileDocumentIds('thread-1', 'viewer')).toEqual([]);
  });
});
