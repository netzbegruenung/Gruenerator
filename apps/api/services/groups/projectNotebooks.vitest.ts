import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));
vi.mock('../../config/notebookCollectionMap.js', () => ({
  isNotebookImplicitlySearchable: (id: string) => id !== 'hidden-notebook',
}));

const { selectProjectNotebooks, getProjectNotebookIds, PROJECT_NOTEBOOKS_PER_TURN } =
  await import('./projectNotebooks.js');

const sys = (id: string) => ({ contentType: 'system_notebooks' as const, contentId: id });
const usr = (id: string) => ({ contentType: 'notebook_collections' as const, contentId: id });

describe('selectProjectNotebooks', () => {
  it('returns nothing without shares', () => {
    expect(selectProjectNotebooks([])).toEqual([]);
  });

  it('keeps system and user notebooks in share order', () => {
    expect(selectProjectNotebooks([sys('gruene'), usr('u-1')])).toEqual(['gruene', 'u-1']);
  });

  it('keeps a system notebook hidden on this instance out and does not count it', () => {
    const shares = [sys('hidden-notebook'), ...Array.from({ length: 8 }, (_, i) => usr(`u-${i}`))];
    const out = selectProjectNotebooks(shares);
    expect(out).not.toContain('hidden-notebook');
    expect(out).toHaveLength(PROJECT_NOTEBOOKS_PER_TURN);
  });

  it('caps the total, newest first', () => {
    const shares = Array.from({ length: 12 }, (_, i) => (i % 2 ? sys(`s-${i}`) : usr(`u-${i}`)));
    const out = selectProjectNotebooks(shares);
    expect(out).toHaveLength(PROJECT_NOTEBOOKS_PER_TURN);
    expect(out[0]).toBe('u-0');
  });

  it('dedupes repeated shares', () => {
    expect(selectProjectNotebooks([usr('u-1'), usr('u-1')])).toEqual(['u-1']);
  });
});

describe('getProjectNotebookIds', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns nothing for a thread outside a project, a trashed project, a non-member or a foreign thread', async () => {
    // All four are decided in SQL (projectThreadScopeSql): no row comes back.
    mockQuery.mockResolvedValue([]);
    expect(await getProjectNotebookIds('t', 'u')).toEqual([]);
  });

  it('binds the list to an active member, own or team thread, live rows', async () => {
    mockQuery.mockResolvedValue([]);
    await getProjectNotebookIds('t', 'u');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/group_memberships gm[^]*gm\.user_id = \$2[^]*gm\.is_active = TRUE/);
    expect(sql).toMatch(/t\.user_id::text = \$2::text OR EXISTS[^]*content_type = .chat_threads./);
    expect(sql).toMatch(/t\.deleted_at IS NULL/);
    expect(sql).toMatch(/g\.deleted_at IS NULL/);
    expect(sql).toMatch(/content_type IN \('system_notebooks', 'notebook_collections'\)/);
    expect(params.slice(0, 2)).toEqual(['t', 'u']);
  });

  it('maps share rows to ids', async () => {
    mockQuery.mockResolvedValue([
      { content_type: 'system_notebooks', content_id: 'gruene' },
      { content_type: 'notebook_collections', content_id: 'u-1' },
    ]);
    expect(await getProjectNotebookIds('t', 'u')).toEqual(['gruene', 'u-1']);
  });
});
