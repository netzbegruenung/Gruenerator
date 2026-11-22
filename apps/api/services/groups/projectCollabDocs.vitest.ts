import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const { getProjectCollabDocs, appendProjectDocParts, PROJECT_COLLAB_DOC_CAP } =
  await import('./projectCollabDocs.js');

describe('getProjectCollabDocs', () => {
  beforeEach(() => mockQuery.mockReset());

  it('sorts the shared documents by how they are read, once each', async () => {
    mockQuery.mockResolvedValue([
      { id: 'a', subtype: 'docs' },
      { id: 'b', subtype: 'sheets' },
      { id: 'c', subtype: 'boards' },
      { id: 'd', subtype: 'presentations' },
      { id: 'a', subtype: 'docs' },
    ]);
    expect(await getProjectCollabDocs('thread-1', 'viewer')).toEqual({
      docIds: ['a', 'd'],
      sheetIds: ['b'],
      boardIds: ['c'],
    });
  });

  it('binds access to the member, drops trashed rows and caps the newest', async () => {
    mockQuery.mockResolvedValue([]);
    await getProjectCollabDocs('thread-1', 'viewer');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/gm\.user_id = \$2[^]*gm\.is_active = TRUE/);
    expect(sql).toMatch(/t\.user_id::text = \$2::text OR EXISTS/);
    expect(sql).toMatch(/content_type = 'collaborative_documents'/);
    expect(sql).toMatch(/cd\.deleted_at IS NULL AND cd\.is_deleted = false/);
    expect(sql).toMatch(/ORDER BY gcs\.shared_at DESC\s+LIMIT \$3/);
    expect(params[2]).toBe(PROJECT_COLLAB_DOC_CAP);
    expect(params[3]).not.toContain('video');
  });
});

describe('appendProjectDocParts', () => {
  it('keeps the existing material untouched when there is nothing to add', () => {
    expect(appendProjectDocParts('mentioned', [])).toBe('mentioned');
    expect(appendProjectDocParts(null, [])).toBeNull();
  });

  it('puts project documents behind the mentioned ones, separated', () => {
    expect(appendProjectDocParts('### A\n\nx', ['### B\n\ny', '### C\n\nz'])).toBe(
      '### A\n\nx\n\n---\n\n### B\n\ny\n\n---\n\n### C\n\nz'
    );
    expect(appendProjectDocParts(null, ['### B'])).toBe('### B');
  });
});
