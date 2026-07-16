import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  makeBoardsTasksTool,
  makeDocumentsTool,
  makeFindContentTool,
  makeGroupsTool,
  makeMediaTool,
  makeNotebooksTool,
  type PersonalToolCtx,
} from './personalDataTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

// --- mocked services (lazy refs so vi.mock hoisting is safe) -----------------
const searchOfficeContent = vi.fn();
const listUserDocuments = vi.fn();
const aggregateRecentActivity = vi.fn();
const listUserBoards = vi.fn();
const loadBoardState = vi.fn();
const resolveCardDisplay = vi.fn();
const updateCard = vi.fn();
const listUserGroups = vi.fn();
const findGroups = vi.fn();
const hasWriteAccess = vi.fn();
const emitToolConfirmAction = vi.fn();
const dbQuery = vi.fn();
const getUserProjects = vi.fn();
const deleteProject = vi.fn();
const getUserShares = vi.fn();
const deleteShare = vi.fn();
const nbGetUserCollections = vi.fn();
const nbGetCollection = vi.fn();
const nbUpdate = vi.fn();
const nbDelete = vi.fn();

vi.mock('../../docs/docsSearch.js', () => ({
  searchOfficeContent: (...a: unknown[]) => searchOfficeContent(...a),
  listUserDocuments: (...a: unknown[]) => listUserDocuments(...a),
  officeUrl: (subtype: string | null, id: string) =>
    subtype === 'boards' ? `/boards/${id}` : `/office/${id}`,
  officeKindLabel: (subtype: string | null) => (subtype === 'sheets' ? 'Tabelle' : 'Dokument'),
  officeSnippet: (_subtype: string | null, content: string | null) => content ?? '',
}));
vi.mock('../../../services/boards/BoardService.js', () => ({
  listUserBoards: (...a: unknown[]) => listUserBoards(...a),
  loadBoardState: (...a: unknown[]) => loadBoardState(...a),
  resolveCardDisplay: (...a: unknown[]) => resolveCardDisplay(...a),
}));
vi.mock('../../../services/boards/boardCardWriteService.js', () => ({
  updateCard: (...a: unknown[]) => updateCard(...a),
}));
vi.mock('../../../services/groups/groupQueries.js', () => ({
  listUserGroups: (...a: unknown[]) => listUserGroups(...a),
  findGroups: (...a: unknown[]) => findGroups(...a),
}));
vi.mock('../../workplace/recentActivityController.js', () => ({
  aggregateRecentActivity: (...a: unknown[]) => aggregateRecentActivity(...a),
}));
vi.mock('../confirmController.js', () => ({
  hasWriteAccess: (...a: unknown[]) => hasWriteAccess(...a),
}));
vi.mock('../services/confirmActionService.js', () => ({
  emitToolConfirmAction: (...a: unknown[]) => emitToolConfirmAction(...a),
  newActionId: () => 'action_test',
}));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: (...a: unknown[]) => dbQuery(...a) }),
}));
vi.mock('../../../services/sharedMediaService.js', () => ({
  getSharedMediaService: () => ({
    getUserShares: (...a: unknown[]) => getUserShares(...a),
    deleteShare: (...a: unknown[]) => deleteShare(...a),
  }),
  USER_VISIBLE_SHARE_STATUSES: ['ready', 'draft'],
}));
vi.mock('../../../services/subtitler/ProjectService.js', () => ({
  getSubtitlerProjectService: () => ({
    ensureInitialized: () => Promise.resolve(),
    getUserProjects: (...a: unknown[]) => getUserProjects(...a),
    deleteProject: (...a: unknown[]) => deleteProject(...a),
  }),
}));
vi.mock('../../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    getUserNotebookCollections = (...a: unknown[]) => nbGetUserCollections(...a);
    getNotebookCollection = (...a: unknown[]) => nbGetCollection(...a);
    updateNotebookCollection = (...a: unknown[]) => nbUpdate(...a);
    deleteNotebookCollection = (...a: unknown[]) => nbDelete(...a);
  },
}));

// --- helpers -----------------------------------------------------------------
type SseEvent = { type: string; payload: unknown };
function fakeSse(sink: SseEvent[]) {
  return { send: (type: string, payload: unknown) => sink.push({ type, payload }) };
}
function ctx(
  userId: string | null,
  sink: SseEvent[] = [],
  registry = createSourceRegistry()
): PersonalToolCtx {
  return {
    state: { agentConfig: userId ? { userId } : {} } as unknown as ChatGraphState,
    sse: fakeSse(sink) as unknown as PersonalToolCtx['sse'],
    threadId: 't1',
    sourceRegistry: registry,
  };
}
function exec(tool: unknown, input: unknown) {
  return (tool as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }).execute(
    input,
    { toolCallId: 'c1' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- find_content ------------------------------------------------------------
describe('find_content', () => {
  it('no session → error', async () => {
    const out = (await exec(makeFindContentTool(ctx(null)), { action: 'recent', limit: 5 })) as {
      error?: string;
    };
    expect(out.error).toBeTruthy();
  });

  it('search requires a query', async () => {
    const out = (await exec(makeFindContentTool(ctx('u1')), { action: 'search', limit: 5 })) as {
      error?: string;
    };
    expect(out.error).toMatch(/Suchbegriff/);
    expect(searchOfficeContent).not.toHaveBeenCalled();
  });

  it('search maps hits to clickable rows scoped to the user', async () => {
    searchOfficeContent.mockResolvedValue([
      { id: 'd1', title: 'Klimaplan', document_subtype: 'docs', content: 'Auszug' },
    ]);
    const out = (await exec(makeFindContentTool(ctx('u1')), {
      action: 'search',
      query: 'klima',
      limit: 5,
    })) as { results: Array<{ title: string; url: string }>; resultCount: number };
    expect(searchOfficeContent).toHaveBeenCalledWith('u1', 'klima', { limit: 5 });
    expect(out.resultCount).toBe(1);
    expect(out.results[0]).toMatchObject({ title: 'Klimaplan', url: '/office/d1' });
  });

  it('recent maps the activity feed', async () => {
    aggregateRecentActivity.mockResolvedValue([
      { title: 'Board X', href: '/boards/b1', type: 'board', content: null },
    ]);
    const out = (await exec(makeFindContentTool(ctx('u1')), { action: 'recent', limit: 5 })) as {
      results: Array<{ url: string }>;
    };
    expect(out.results[0].url).toBe('/boards/b1');
  });

  // The live bug: split-mode synth reads ONLY the source registry, so a tool that
  // just returns `{ results }` was invisible → "keine Dokumente liegen mir vor".
  it('registers results into the source registry so the split-mode synth can ground', async () => {
    searchOfficeContent.mockResolvedValue([
      { id: 'd1', title: 'Klimaplan', document_subtype: 'docs', content: 'Auszug' },
    ]);
    const registry = createSourceRegistry();
    await exec(makeFindContentTool(ctx('u1', [], registry)), {
      action: 'search',
      query: 'klima',
      limit: 5,
    });
    expect(registry.size).toBe(1);
    expect(registry.renderAll()).toContain('Klimaplan');
  });
});

// --- documents ---------------------------------------------------------------
describe('documents', () => {
  it('rename is refused without write access', async () => {
    listUserDocuments.mockResolvedValue([{ id: 'd1', title: 'Alt', document_subtype: 'docs' }]);
    hasWriteAccess.mockResolvedValue(false);
    const out = (await exec(makeDocumentsTool(ctx('u1')), {
      action: 'rename',
      id: 'd1',
      title: 'Neu',
      permission: 'viewer',
      confirm: false,
      limit: 15,
    })) as { error?: string };
    expect(out.error).toMatch(/Berechtigung/);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('rename with access updates the title', async () => {
    listUserDocuments.mockResolvedValue([{ id: 'd1', title: 'Alt', document_subtype: 'docs' }]);
    hasWriteAccess.mockResolvedValue(true);
    dbQuery.mockResolvedValue([]);
    const out = (await exec(makeDocumentsTool(ctx('u1')), {
      action: 'rename',
      id: 'd1',
      title: 'Neu',
      permission: 'viewer',
      confirm: false,
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE collaborative_documents'), [
      'Neu',
      'd1',
    ]);
  });

  it('delete without confirm asks for confirmation and does NOT delete', async () => {
    listUserDocuments.mockResolvedValue([{ id: 'd1', title: 'Alt', document_subtype: 'docs' }]);
    const out = (await exec(makeDocumentsTool(ctx('u1')), {
      action: 'delete',
      id: 'd1',
      permission: 'viewer',
      confirm: false,
      limit: 15,
    })) as { needsConfirmation?: boolean };
    expect(out.needsConfirmation).toBe(true);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('delete with confirm soft-deletes only for the owner', async () => {
    listUserDocuments.mockResolvedValue([{ id: 'd1', title: 'Alt', document_subtype: 'docs' }]);
    dbQuery.mockResolvedValueOnce([{ created_by: 'u1' }]).mockResolvedValueOnce([]);
    const out = (await exec(makeDocumentsTool(ctx('u1')), {
      action: 'delete',
      id: 'd1',
      permission: 'viewer',
      confirm: true,
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining('is_deleted = true'), ['d1']);
  });

  it('share_to_group only resolves to a group the user is a MEMBER of', async () => {
    listUserDocuments.mockResolvedValue([{ id: 'd1', title: 'Doc', document_subtype: 'docs' }]);
    // findGroups returns a public non-member group (role '') → must be rejected.
    findGroups.mockResolvedValue([{ id: 'g9', name: 'Öffentlich', slug_suffix: null, role: '' }]);
    const out = (await exec(makeDocumentsTool(ctx('u1')), {
      action: 'share_to_group',
      id: 'd1',
      groupName: 'Öffentlich',
      permission: 'viewer',
      confirm: false,
      limit: 15,
    })) as { error?: string };
    expect(out.error).toMatch(/angehörst/);
    expect(emitToolConfirmAction).not.toHaveBeenCalled();
  });

  it('share_to_group emits a share_doc confirm for a member group', async () => {
    listUserDocuments.mockResolvedValue([{ id: 'd1', title: 'Doc', document_subtype: 'docs' }]);
    findGroups.mockResolvedValue([{ id: 'g1', name: 'Klima', slug_suffix: 'ab12', role: 'member' }]);
    const out = (await exec(makeDocumentsTool(ctx('u1')), {
      action: 'share_to_group',
      id: 'd1',
      groupName: 'Klima',
      permission: 'editor',
      confirm: false,
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    const [, action] = emitToolConfirmAction.mock.calls[0] as [unknown, { type: string; payload: unknown }];
    expect(action.type).toBe('share_doc');
    expect(action.payload).toMatchObject({
      docId: 'd1',
      groupId: 'g1',
      permissionLevel: 'editor',
    });
  });
});

// --- boards_tasks ------------------------------------------------------------
describe('boards_tasks', () => {
  const board = {
    id: 'b1',
    title: 'Kampagne',
    boardType: 'kanban',
    fields: [],
    rows: [
      { id: 'r1', snap: { cardTitle: 'Plakate', statusLabel: 'Offen', dueDate: '2026-08-01', assigneeNames: ['Mia'] } },
      { id: 'r2', snap: { cardTitle: 'Idee', statusLabel: 'Ideen', dueDate: null, assigneeNames: [] } },
    ],
  };
  beforeEach(() => {
    resolveCardDisplay.mockImplementation((_f: unknown, row: { snap: unknown }) => row.snap);
  });

  it('get_cards resolves from loaded state without per-card reloads', async () => {
    loadBoardState.mockResolvedValue(board);
    const out = (await exec(makeBoardsTasksTool(ctx('u1')), {
      action: 'get_cards',
      boardId: 'b1',
      limit: 15,
    })) as { cards: Array<{ title: string }> };
    expect(out.cards).toHaveLength(2);
    expect(out.cards[0].title).toBe('Plakate');
    // resolved from state, never via a per-card getCardSnapshot reload:
    expect(resolveCardDisplay).toHaveBeenCalledTimes(2);
  });

  it('my_tasks keeps only cards with a due date or assignee', async () => {
    listUserBoards.mockResolvedValue([{ id: 'b1', title: 'Kampagne', content: null }]);
    loadBoardState.mockResolvedValue(board);
    const out = (await exec(makeBoardsTasksTool(ctx('u1')), { action: 'my_tasks', limit: 15 })) as {
      taskCount: number;
      tasks: Array<{ title: string }>;
    };
    expect(out.taskCount).toBe(1);
    expect(out.tasks[0].title).toBe('Plakate');
  });

  it('add_card emits a modify_board confirm (does not write directly)', async () => {
    loadBoardState.mockResolvedValue(board);
    const out = (await exec(makeBoardsTasksTool(ctx('u1')), {
      action: 'add_card',
      boardId: 'b1',
      title: 'Flyer verteilen',
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    const [, action] = emitToolConfirmAction.mock.calls[0] as [unknown, { type: string; payload: { rows: unknown[] } }];
    expect(action.type).toBe('modify_board');
    expect(action.payload.rows).toHaveLength(1);
    expect(updateCard).not.toHaveBeenCalled();
  });

  it('move_card is refused without write access', async () => {
    hasWriteAccess.mockResolvedValue(false);
    const out = (await exec(makeBoardsTasksTool(ctx('u1')), {
      action: 'move_card',
      boardId: 'b1',
      cardId: 'r1',
      status: 'Erledigt',
      limit: 15,
    })) as { error?: string };
    expect(out.error).toMatch(/Berechtigung/);
    expect(updateCard).not.toHaveBeenCalled();
  });

  it('move_card with access calls updateCard with the target status', async () => {
    hasWriteAccess.mockResolvedValue(true);
    updateCard.mockResolvedValue({ ok: true, cardId: 'r1', applied: ['Status'] });
    const out = (await exec(makeBoardsTasksTool(ctx('u1')), {
      action: 'move_card',
      boardId: 'b1',
      cardId: 'r1',
      status: 'Erledigt',
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    expect(updateCard).toHaveBeenCalledWith('b1', 'r1', { status: 'Erledigt' });
  });
});

// --- groups ------------------------------------------------------------------
describe('groups', () => {
  it('list maps memberships to rows', async () => {
    listUserGroups.mockResolvedValue([
      { id: 'g1', name: 'Klima', slug_suffix: 'ab12', role: 'admin', member_count: 7 },
    ]);
    const out = (await exec(makeGroupsTool(ctx('u1')), { action: 'list', limit: 15 })) as {
      results: Array<{ title: string; url: string }>;
    };
    expect(out.results[0].title).toBe('Klima');
    expect(out.results[0].url).toContain('/gruppen/');
  });
});

// --- media -------------------------------------------------------------------
describe('media', () => {
  it('list merges reels and sharepics with follow-up refs', async () => {
    getUserProjects.mockResolvedValue([{ id: 'p1', title: 'Reel A', status: 'exported' }]);
    getUserShares.mockResolvedValue([{ share_token: 'tok', title: 'Pic', media_type: 'image' }]);
    const out = (await exec(makeMediaTool(ctx('u1')), { action: 'list', type: 'all', limit: 15 })) as {
      results: Array<{ type: string; ref?: string }>;
    };
    const refs = out.results.map((r) => r.ref);
    expect(refs).toContain('reel:p1');
    expect(refs).toContain('sharepic:tok');
  });

  it('delete without confirm asks first; with confirm routes to the right service', async () => {
    const ask = (await exec(makeMediaTool(ctx('u1')), {
      action: 'delete',
      type: 'all',
      ref: 'reel:p1',
      confirm: false,
      limit: 15,
    })) as { needsConfirmation?: boolean };
    expect(ask.needsConfirmation).toBe(true);
    expect(deleteProject).not.toHaveBeenCalled();

    deleteProject.mockResolvedValue({ ok: true });
    await exec(makeMediaTool(ctx('u1')), {
      action: 'delete',
      type: 'all',
      ref: 'reel:p1',
      confirm: true,
      limit: 15,
    });
    expect(deleteProject).toHaveBeenCalledWith('u1', 'p1');
  });
});

// --- notebooks ---------------------------------------------------------------
describe('notebooks', () => {
  it('rename is refused when the collection belongs to someone else', async () => {
    nbGetCollection.mockResolvedValue({ id: 'n1', name: 'Fremd', user_id: 'other' });
    const out = (await exec(makeNotebooksTool(ctx('u1')), {
      action: 'rename',
      id: 'n1',
      name: 'Neu',
      confirm: false,
      limit: 15,
    })) as { error?: string };
    expect(out.error).toMatch(/kein Zugriff/);
    expect(nbUpdate).not.toHaveBeenCalled();
  });

  it('rename updates an owned collection', async () => {
    nbGetCollection.mockResolvedValue({ id: 'n1', name: 'Alt', user_id: 'u1' });
    nbUpdate.mockResolvedValue({ success: true });
    const out = (await exec(makeNotebooksTool(ctx('u1')), {
      action: 'rename',
      id: 'n1',
      name: 'Neu',
      confirm: false,
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    expect(nbUpdate).toHaveBeenCalledWith('n1', { name: 'Neu' });
  });

  it('delete needs a two-step confirm', async () => {
    nbGetCollection.mockResolvedValue({ id: 'n1', name: 'Alt', user_id: 'u1' });
    const out = (await exec(makeNotebooksTool(ctx('u1')), {
      action: 'delete',
      id: 'n1',
      confirm: false,
      limit: 15,
    })) as { needsConfirmation?: boolean };
    expect(out.needsConfirmation).toBe(true);
    expect(nbDelete).not.toHaveBeenCalled();
  });
});
