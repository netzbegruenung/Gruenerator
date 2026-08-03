import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  makeBoardsTasksTool,
  makeDocumentsTool,
  makeReadArtifactTool,
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
const getGroupByToken = vi.fn();
const hasWriteAccess = vi.fn();
const emitToolConfirmAction = vi.fn();
const dbQuery = vi.fn();
const getUserProjects = vi.fn();
const deleteProject = vi.fn();
const searchReels = vi.fn().mockResolvedValue([]);
const getReelTranscript = vi.fn().mockResolvedValue(null);
const getUserShares = vi.fn();
const deleteShare = vi.fn();
const nbGetUserCollections = vi.fn();
const nbGetCollection = vi.fn();
const nbUpdate = vi.fn();
const nbDelete = vi.fn();
const readArtifactContent = vi.fn();

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
vi.mock('../../../services/groups/groupMutations.js', () => ({
  getGroupByToken: (...a: unknown[]) => getGroupByToken(...a),
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
vi.mock('../../../services/subtitler/reelSearch.js', () => ({
  searchReels: (...a: unknown[]) => searchReels(...a),
  getReelTranscript: (...a: unknown[]) => getReelTranscript(...a),
  reelUrl: (id: string) => `/studio/video?project=${id}`,
}));
vi.mock('../services/artifactReader.js', () => ({
  readArtifactContent: (...a: unknown[]) => readArtifactContent(...a),
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
  // clearAllMocks keeps implementations, so the reel mocks have to be put back
  // to "no reels" or a search test leaks its hits into every later assertion.
  searchReels.mockResolvedValue([]);
  getReelTranscript.mockResolvedValue(null);
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

  it('search also surfaces matching reels alongside office content', async () => {
    searchOfficeContent.mockResolvedValue([
      { id: 'd1', title: 'Klimaplan', document_subtype: 'docs', content: 'Auszug' },
    ]);
    searchReels.mockResolvedValue([
      {
        id: 'p9',
        title: 'Klima-Reel',
        snippet: '[00:00.0–00:02.5] Klimageld jetzt.',
        matchedTranscript: true,
        url: '/studio/video?project=p9',
        status: 'exported',
        hasThumbnail: true,
        lastEditedAt: '2026-04-01T10:00:00Z',
      },
    ]);
    const out = (await exec(makeFindContentTool(ctx('u1')), {
      action: 'search',
      query: 'klima',
      limit: 5,
    })) as { results: Array<{ title: string; url: string; type?: string }>; resultCount: number };

    expect(searchReels).toHaveBeenCalledWith('u1', 'klima', 5);
    expect(out.resultCount).toBe(2);
    expect(out.results.map((r) => r.type)).toContain('Reel');
    expect(out.results.find((r) => r.type === 'Reel')?.url).toBe('/studio/video?project=p9');
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
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE collaborative_documents'),
      ['Neu', 'd1']
    );
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
    findGroups.mockResolvedValue([
      { id: 'g1', name: 'Klima', slug_suffix: 'ab12', role: 'member' },
    ]);
    const out = (await exec(makeDocumentsTool(ctx('u1')), {
      action: 'share_to_group',
      id: 'd1',
      groupName: 'Klima',
      permission: 'editor',
      confirm: false,
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    const [, action] = emitToolConfirmAction.mock.calls[0] as [
      unknown,
      { type: string; payload: unknown },
    ];
    expect(action.type).toBe('share_doc');
    expect(action.payload).toMatchObject({
      docId: 'd1',
      groupId: 'g1',
      permissionLevel: 'editor',
    });
  });

  // Compound "erstelle ein Dokument … und teile es mit meiner Gruppe": share_to_group
  // with no id targets the doc just created this turn (state.createdDocument), even
  // before it surfaces in listUserDocuments.
  it('share_to_group falls back to the just-created document when no id is given', async () => {
    listUserDocuments.mockResolvedValue([]);
    findGroups.mockResolvedValue([
      { id: 'g1', name: 'Klima', slug_suffix: 'ab12', role: 'member' },
    ]);
    const c = ctx('u1');
    (c.state as unknown as { createdDocument: unknown }).createdDocument = {
      documentId: 'new1',
      title: 'Klimaplan',
      subtype: 'docs',
      url: '/office/new1',
    };
    const out = (await exec(makeDocumentsTool(c), {
      action: 'share_to_group',
      groupName: 'Klima',
      permission: 'viewer',
      confirm: false,
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    const [, action] = emitToolConfirmAction.mock.calls[0] as [
      unknown,
      { type: string; payload: unknown },
    ];
    expect(action.type).toBe('share_doc');
    expect(action.payload).toMatchObject({ docId: 'new1', docTitle: 'Klimaplan', groupId: 'g1' });
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
      {
        id: 'r1',
        snap: {
          cardTitle: 'Plakate',
          statusLabel: 'Offen',
          dueDate: '2026-08-01',
          assigneeNames: ['Mia'],
        },
      },
      {
        id: 'r2',
        snap: { cardTitle: 'Idee', statusLabel: 'Ideen', dueDate: null, assigneeNames: [] },
      },
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
    const [, action] = emitToolConfirmAction.mock.calls[0] as [
      unknown,
      { type: string; payload: { rows: unknown[] } },
    ];
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

  it('create without a name → error, no confirm', async () => {
    const out = (await exec(makeGroupsTool(ctx('u1')), { action: 'create', limit: 15 })) as {
      error?: string;
    };
    expect(out.error).toMatch(/name/);
    expect(emitToolConfirmAction).not.toHaveBeenCalled();
  });

  it('create emits a create_group confirm with name + description', async () => {
    const out = (await exec(makeGroupsTool(ctx('u1')), {
      action: 'create',
      name: 'Klima-AG',
      description: 'Für den Klimaschutz',
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    const [, action] = emitToolConfirmAction.mock.calls[0] as [
      unknown,
      { type: string; payload: unknown },
    ];
    expect(action.type).toBe('create_group');
    expect(action.payload).toMatchObject({ name: 'Klima-AG', description: 'Für den Klimaschutz' });
  });

  it('join with an unknown token → error, no confirm', async () => {
    getGroupByToken.mockResolvedValue(null);
    const out = (await exec(makeGroupsTool(ctx('u1')), {
      action: 'join',
      joinToken: 'deadbeef',
      limit: 15,
    })) as { error?: string };
    expect(out.error).toMatch(/Einladungslink/);
    expect(emitToolConfirmAction).not.toHaveBeenCalled();
  });

  it('join emits a join_group confirm naming the resolved group', async () => {
    getGroupByToken.mockResolvedValue({ id: 'g1', name: 'Klima' });
    const out = (await exec(makeGroupsTool(ctx('u1')), {
      action: 'join',
      joinToken: 'tok123',
      limit: 15,
    })) as { ok?: boolean };
    expect(out.ok).toBe(true);
    expect(getGroupByToken).toHaveBeenCalledWith('tok123');
    const [, action] = emitToolConfirmAction.mock.calls[0] as [
      unknown,
      { type: string; payload: unknown },
    ];
    expect(action.type).toBe('join_group');
    expect(action.payload).toMatchObject({ joinToken: 'tok123', groupName: 'Klima' });
  });
});

// --- media -------------------------------------------------------------------
describe('media', () => {
  it('list merges reels and sharepics with follow-up refs', async () => {
    getUserProjects.mockResolvedValue([{ id: 'p1', title: 'Reel A', status: 'exported' }]);
    getUserShares.mockResolvedValue([{ share_token: 'tok', title: 'Pic', media_type: 'image' }]);
    const out = (await exec(makeMediaTool(ctx('u1')), {
      action: 'list',
      type: 'all',
      limit: 15,
    })) as {
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

  const reelHit = {
    id: 'p9',
    title: 'Windkraft-Reel',
    snippet: '[00:00.0–00:02.5] Heute reden wir über Windkraft.',
    matchedTranscript: true,
    url: '/studio/video?project=p9',
    status: 'exported',
    hasThumbnail: true,
    lastEditedAt: '2026-04-01T10:00:00Z',
  };

  it('search finds reels by spoken content and hands back a transcript ref', async () => {
    searchReels.mockResolvedValue([reelHit]);
    const out = (await exec(makeMediaTool(ctx('u1')), {
      action: 'search',
      type: 'all',
      query: 'Windkraft',
      confirm: false,
      limit: 15,
    })) as {
      resultCount: number;
      results: Array<{ ref?: string; snippet?: string }>;
      note?: string;
    };

    expect(searchReels).toHaveBeenCalledWith('u1', 'Windkraft', 10);
    expect(out.resultCount).toBe(1);
    expect(out.results[0].ref).toBe('reel:p9');
    expect(out.results[0].snippet).toContain('Heute reden wir über Windkraft.');
    expect(out.note).toContain('transcript');
  });

  it('search rejects a blank query', async () => {
    const out = (await exec(makeMediaTool(ctx('u1')), {
      action: 'search',
      type: 'all',
      query: '  ',
      confirm: false,
      limit: 15,
    })) as { error?: string };
    expect(out.error).toContain('query');
    expect(searchReels).not.toHaveBeenCalled();
  });

  it('transcript returns the spoken content and grounds it for the synthesizer', async () => {
    getReelTranscript.mockResolvedValue({
      title: 'Windkraft-Reel',
      transcript: '[00:00.0–00:02.5] Heute reden wir über Windkraft.',
      segmentCount: 1,
    });
    const registry = createSourceRegistry();
    const out = (await exec(makeMediaTool(ctx('u1', [], registry)), {
      action: 'transcript',
      type: 'all',
      ref: 'reel:p9',
      confirm: false,
      limit: 15,
    })) as { title: string; transcript: string; segmentCount: number };

    expect(getReelTranscript).toHaveBeenCalledWith('u1', 'p9');
    expect(out.segmentCount).toBe(1);
    expect(out.transcript).toContain('Heute reden wir über Windkraft.');
    // Split mode: the synthesizer sees only rendered sources, so the transcript
    // must be in the registry, not just the tool return value.
    expect(registry.renderAll()).toContain('Heute reden wir über Windkraft.');
  });

  it('transcript refuses a non-reel ref and reports a missing reel', async () => {
    const bad = (await exec(makeMediaTool(ctx('u1')), {
      action: 'transcript',
      type: 'all',
      ref: 'sharepic:tok',
      confirm: false,
      limit: 15,
    })) as { error?: string };
    expect(bad.error).toContain('Reels');
    expect(getReelTranscript).not.toHaveBeenCalled();

    getReelTranscript.mockResolvedValue(null);
    const missing = (await exec(makeMediaTool(ctx('u1')), {
      action: 'transcript',
      type: 'all',
      ref: 'reel:p9',
      confirm: false,
      limit: 15,
    })) as { error?: string };
    expect(missing.error).toContain('nicht gefunden');
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

// --- read_artifact -----------------------------------------------------------

/**
 * Before this tool existed the loop could LIST artifacts and never open one:
 * `documents` action="get" returns `{title, url, type}`. On 03.08.2026 that gap
 * turned "vergleiche das PDF und die Präsentation" into a fabricated answer —
 * which slide had been fixed, that the source matrix was complete.
 */
function artifactState(
  userId: string,
  artifacts: Array<{ kind: string; ref: string | null; label?: string | null }>
): PersonalToolCtx {
  const base = ctx(userId);
  return {
    ...base,
    state: {
      agentConfig: { userId },
      threadArtifacts: artifacts,
    } as unknown as ChatGraphState,
  };
}

describe('read_artifact', () => {
  it('no session → error', async () => {
    const out = (await exec(makeReadArtifactTool(ctx(null)), {
      kind: 'presentation',
    })) as { error?: string };
    expect(out.error).toContain('Nutzer-Sitzung');
  });

  it('reads by explicit id and grounds the content for the split synth', async () => {
    readArtifactContent.mockResolvedValueOnce('Folie 1: Ausgangslage\nFolie 2: Ziel');
    const registry = createSourceRegistry();
    const c = { ...ctx('u1'), sourceRegistry: registry };

    const out = (await exec(makeReadArtifactTool(c), { kind: 'presentation', id: 'deck-1' })) as {
      content: string;
    };

    expect(out.content).toContain('Folie 2: Ziel');
    expect(readArtifactContent).toHaveBeenCalledWith({
      id: 'deck-1',
      kind: 'presentation',
      userId: 'u1',
    });
    // Split mode's writer sees nothing but the rendered sources.
    expect(registry.renderAll()).toContain('Folie 2: Ziel');
  });

  it('resolves the artifact of THIS conversation when no id is given', async () => {
    // The inventory names artifacts by noun and title only — the model has no
    // id to pass, so it must be able to leave it out.
    readArtifactContent.mockResolvedValueOnce('Folientext');
    const c = artifactState('u1', [
      { kind: 'presentation', ref: 'deck-42', label: 'Klimaziel 2040' },
    ]);

    await exec(makeReadArtifactTool(c), { kind: 'presentation' });

    expect(readArtifactContent).toHaveBeenCalledWith({
      id: 'deck-42',
      kind: 'presentation',
      userId: 'u1',
    });
  });

  it('reads a PDF by its asset FILE NAME, not a document uuid', async () => {
    // The asymmetry that produced both a 22P02 and a "nicht gefunden": a PDF's
    // ref is `uuid.pdf`, every other kind's is a collaborative-document UUID.
    readArtifactContent.mockResolvedValueOnce('EU-Klimaziel 2040 — 90 Prozent');
    const c = artifactState('u1', [
      { kind: 'pdf', ref: '3f1c9d20-4b7e-4a11-9c8d-5e2a7b6f0d43.pdf', label: 'Klimaziel' },
    ]);

    await exec(makeReadArtifactTool(c), { kind: 'pdf' });

    expect(readArtifactContent).toHaveBeenCalledWith({
      id: '3f1c9d20-4b7e-4a11-9c8d-5e2a7b6f0d43.pdf',
      kind: 'pdf',
      userId: 'u1',
    });
  });

  it('asks instead of guessing between two artifacts of the same kind', async () => {
    const c = artifactState('u1', [
      { kind: 'presentation', ref: 'deck-1', label: 'Erste' },
      { kind: 'presentation', ref: 'deck-2', label: 'Zweite' },
    ]);

    const out = (await exec(makeReadArtifactTool(c), { kind: 'presentation' })) as {
      needsChoice?: boolean;
      candidates?: Array<{ id: string }>;
    };

    expect(out.needsChoice).toBe(true);
    expect(out.candidates?.map((x) => x.id)).toEqual(['deck-1', 'deck-2']);
    expect(readArtifactContent).not.toHaveBeenCalled();
  });

  it('says so when the conversation has no artifact of that kind', async () => {
    const c = artifactState('u1', [{ kind: 'sheet', ref: 'sheet-1', label: 'Budget' }]);
    const out = (await exec(makeReadArtifactTool(c), { kind: 'presentation' })) as {
      error?: string;
    };
    expect(out.error).toContain('Präsentation');
    expect(readArtifactContent).not.toHaveBeenCalled();
  });

  it('reports an unreadable artifact as an error rather than empty content', async () => {
    readArtifactContent.mockResolvedValueOnce(null);
    const out = (await exec(makeReadArtifactTool(ctx('u1')), {
      kind: 'pdf',
      id: 'weg.pdf',
    })) as { error?: string };
    expect(out.error).toMatch(/nicht gefunden|kein Zugriff/);
  });

  it('caps a huge artifact and says that it did', async () => {
    readArtifactContent.mockResolvedValueOnce('x'.repeat(20_000));
    const out = (await exec(makeReadArtifactTool(ctx('u1')), {
      kind: 'doc',
      id: 'd1',
    })) as { content: string; truncated: boolean };
    expect(out.truncated).toBe(true);
    expect(out.content.length).toBeLessThan(20_000);
    expect(out.content).toContain('[gekürzt]');
  });
});
