import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    getCollectionDocuments = mockGetDocs;
  },
}));
vi.mock('../../config/notebookCollectionMap.js', () => ({
  isNotebookImplicitlySearchable: (id: string) => id !== 'hidden-notebook',
}));

const {
  selectProjectNotebooks,
  getProjectNotebookScope,
  resolveProjectUserNotebookDocs,
  PROJECT_NOTEBOOKS_PER_TURN,
} = await import('./projectNotebooks.js');
const { agentNotebookDocIds } =
  await import('../../agents/langgraph/ChatGraph/nodes/agentNotebookScope.js');

const sys = (id: string) => ({ contentType: 'system_notebooks' as const, contentId: id });
const usr = (id: string) => ({ contentType: 'notebook_collections' as const, contentId: id });

describe('selectProjectNotebooks', () => {
  it('returns nothing without shares', () => {
    expect(selectProjectNotebooks([])).toEqual({ systemSlugs: [], userNotebookIds: [] });
  });

  it('includes system and user notebooks', () => {
    expect(selectProjectNotebooks([sys('gruene'), usr('u-1')])).toEqual({
      systemSlugs: ['gruene'],
      userNotebookIds: ['u-1'],
    });
  });

  it('keeps a system notebook hidden on this instance out and does not count it', () => {
    const shares = [sys('hidden-notebook'), ...Array.from({ length: 8 }, (_, i) => usr(`u-${i}`))];
    const out = selectProjectNotebooks(shares);
    expect(out.systemSlugs).toEqual([]);
    expect(out.userNotebookIds).toHaveLength(PROJECT_NOTEBOOKS_PER_TURN);
  });

  it('caps the total, newest first', () => {
    const shares = Array.from({ length: 12 }, (_, i) => (i % 2 ? sys(`s-${i}`) : usr(`u-${i}`)));
    const out = selectProjectNotebooks(shares);
    expect(out.systemSlugs.length + out.userNotebookIds.length).toBe(PROJECT_NOTEBOOKS_PER_TURN);
    expect(out.userNotebookIds[0]).toBe('u-0');
  });

  it('dedupes repeated shares', () => {
    expect(selectProjectNotebooks([usr('u-1'), usr('u-1')]).userNotebookIds).toEqual(['u-1']);
  });
});

describe('getProjectNotebookScope', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns nothing for a thread outside a project, a trashed project, a non-member or a foreign thread', async () => {
    // All four are decided in SQL (projectThreadScopeSql): no row comes back.
    mockQuery.mockResolvedValue([]);
    expect(await getProjectNotebookScope('t', 'u')).toEqual({
      systemSlugs: [],
      userNotebookIds: [],
    });
  });

  it('binds access to an active member, own or team thread, live rows', async () => {
    mockQuery.mockResolvedValue([]);
    await getProjectNotebookScope('t', 'u');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/group_memberships gm[^]*gm\.user_id = \$2[^]*gm\.is_active = TRUE/);
    expect(sql).toMatch(/t\.user_id::text = \$2::text OR EXISTS[^]*content_type = .chat_threads./);
    expect(sql).toMatch(/t\.deleted_at IS NULL/);
    expect(sql).toMatch(/g\.deleted_at IS NULL/);
    expect(params[0]).toBe('t');
    expect(params[1]).toBe('u');
  });

  it('maps share rows to the scope', async () => {
    mockQuery.mockResolvedValue([
      { content_type: 'system_notebooks', content_id: 'gruene' },
      { content_type: 'notebook_collections', content_id: 'u-1' },
    ]);
    expect(await getProjectNotebookScope('t', 'u')).toEqual({
      systemSlugs: ['gruene'],
      userNotebookIds: ['u-1'],
    });
  });
});

describe('resolveProjectUserNotebookDocs', () => {
  beforeEach(() => mockGetDocs.mockReset());

  it('maps documents to their notebook and skips a failing notebook', async () => {
    mockGetDocs.mockImplementation(async (id: string) => {
      if (id === 'bad') throw new Error('qdrant down');
      return [{ document_id: `${id}-d1` }, { document_id: `${id}-d2` }];
    });
    const out = await resolveProjectUserNotebookDocs(['n1', 'bad']);
    expect(out.documentIds).toEqual(['n1-d1', 'n1-d2']);
    expect(out.documentNotebookIds['n1-d1']).toBe('n1');
  });

  it('does nothing without notebooks', async () => {
    expect((await resolveProjectUserNotebookDocs([])).documentIds).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});

describe('explicit mention wins over project notebooks', () => {
  it('drops the default document scope when the turn mentions a notebook', () => {
    const state = {
      documentIds: [],
      notebookDocumentIds: ['x'],
      notebookCollectionIds: [],
      defaultNotebookDocumentIds: ['proj-doc'],
    };
    expect(agentNotebookDocIds(state)).toEqual([]);
    expect(agentNotebookDocIds({ ...state, notebookDocumentIds: [] })).toEqual(['proj-doc']);
  });
});
