import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const { getProjectFileSources, PROJECT_FILES_PER_TURN } = await import('./projectFiles.js');

describe('getProjectFileSources', () => {
  beforeEach(() => mockQuery.mockReset());

  it('hands each file over with its uploader as owner, so the search can read it', async () => {
    mockQuery.mockResolvedValue([
      { id: 'd1', title: 'Förderbescheid', filename: 'f.pdf', user_id: 'uploader' },
      { id: 'd2', title: '  ', filename: 'Entwurf.docx', user_id: 'other' },
    ]);
    const out = await getProjectFileSources('thread-1', 'viewer');
    expect(out).toEqual([
      {
        kind: 'user',
        documentId: 'd1',
        notebookId: null,
        ownerUserId: 'uploader',
        title: 'Förderbescheid',
      },
      {
        kind: 'user',
        documentId: 'd2',
        notebookId: null,
        ownerUserId: 'other',
        title: 'Entwurf.docx',
      },
    ]);
  });

  it('binds access to the asking member, the thread owner and the live rows', async () => {
    mockQuery.mockResolvedValue([]);
    await getProjectFileSources('thread-1', 'viewer');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Membership of the viewer, the thread must be the viewer's own, nothing trashed.
    expect(sql).toMatch(/group_memberships gm[^]*gm\.user_id = \$2[^]*gm\.is_active = TRUE/);
    expect(sql).toMatch(/t\.user_id = \$2/);
    expect(sql).toMatch(/t\.deleted_at IS NULL/);
    expect(sql).toMatch(/g\.deleted_at IS NULL/);
    expect(sql).toMatch(/d\.deleted_at IS NULL/);
    expect(sql).toMatch(/d\.status = 'completed'/);
    expect(params).toEqual(['thread-1', 'viewer', PROJECT_FILES_PER_TURN]);
  });

  it('returns nothing for a chat outside any project', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await getProjectFileSources('thread-1', 'viewer')).toEqual([]);
  });
});
