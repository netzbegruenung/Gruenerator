/**
 * `notebooks` gegen Fakes für Helper, Zugriff, Suche, Wolke-Vorschau und
 * Datenbank — kein Qdrant, kein Postgres, keine Wolke. Alles kommt über
 * `ctx.deps` herein, wie der Provider in `cloudFileTools.vitest.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeNotebooksTool, type NotebookToolDeps } from './notebookTools.js';

// `emitToolConfirmAction` legt die Karte in Redis ab; ohne erreichbares Redis
// antwortet der Client nie. Gemockt wird nur der Speicher, die Karte samt
// `CONFIRM_ACTION_CONFIG`-Eintrag bleibt echt.
vi.mock('../services/pendingActionStore.js', () => ({
  pendingActionStore: { store: async () => {} },
}));

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { NotebookAccess } from '../../notebook/notebookAccess.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

const OWNER: NotebookAccess = { exists: true, isOwner: true, canRead: true, canEdit: true };
const READER: NotebookAccess = { exists: true, isOwner: false, canRead: true, canEdit: false };
const EDITOR: NotebookAccess = { exists: true, isOwner: false, canRead: true, canEdit: true };
const DENIED: NotebookAccess = { exists: false, isOwner: false, canRead: false, canEdit: false };

function collection(over: Partial<NotebookCollection> = {}): NotebookCollection {
  return {
    id: 'n1',
    user_id: 'user-1',
    name: 'Kreisverband',
    description: 'Anträge und Protokolle',
    slug_suffix: 'Ab3xK9',
    document_count: 2,
    share_mode: 'private',
    edit_policy: 'owner_only',
    is_public: false,
    public_ownership: null,
    audience: 'de-DE',
    settings: { wolke_folders: [], linked_docs: [] },
    ...over,
  } as NotebookCollection;
}

interface CtxOptions {
  userId?: string | null;
  access?: NotebookAccess;
  collection?: NotebookCollection | null;
  collections?: NotebookCollection[];
  docs?: string[];
  /** Antwort auf SQL nach Muster. */
  query?: (sql: string, params: unknown[]) => unknown[];
  preview?: NotebookToolDeps['preview'];
  search?: NotebookToolDeps['search'];
  groups?: Array<{ id: string; name: string; role: string }>;
  registry?: SourceRegistry;
  userText?: string;
}

function makeCtx(opts: CtxOptions = {}) {
  const notes: Array<[string, string]> = [];
  const registered: unknown[] = [];
  const sseEvents: Array<[string, unknown]> = [];
  const sourceRegistry =
    opts.registry ??
    ({
      note: (title: string, content: string) => notes.push([title, content]),
      register: (results: unknown) => {
        registered.push(results);
        return '[1] Auszug';
      },
    } as unknown as SourceRegistry);
  const sse = {
    send: (event: string, payload: unknown) => sseEvents.push([event, payload]),
  } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'user-1' : opts.userId },
    userLocale: 'de-AT',
    messages: opts.userText ? [{ role: 'user', content: opts.userText }] : [],
  } as unknown as ChatGraphState;

  const row = opts.collection === undefined ? collection() : opts.collection;
  const helper = {
    getUserNotebookCollections: vi.fn(async () => opts.collections ?? (row ? [row] : [])),
    getNotebookCollection: vi.fn(async () => row),
    updateNotebookCollection: vi.fn(async () => ({ success: true })),
    deleteNotebookCollection: vi.fn(async () => ({ success: true })),
    storeNotebookCollection: vi.fn(async () => ({
      success: true,
      collection_id: 'n-new',
      slug_suffix: 'Zz9yX1',
    })),
    addDocumentsToCollection: vi.fn(async (_id: string, ids: string[]) => ({
      success: true,
      added_count: ids.length,
    })),
    getCollectionDocuments: vi.fn(async () =>
      (opts.docs ?? ['d1', 'd2']).map((document_id) => ({
        document_id,
        added_at: '',
        added_by: null,
      }))
    ),
  };
  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => opts.query?.(sql, params) ?? []),
  };
  const deps: NotebookToolDeps = {
    helper: helper as unknown as NotebookToolDeps['helper'],
    access: vi.fn(async () => opts.access ?? OWNER),
    search:
      opts.search ?? vi.fn(async () => ({ ok: false as const, error: 'Suche nicht konfiguriert' })),
    preview: opts.preview ?? vi.fn(async () => ({ error: 'Vorschau nicht konfiguriert' })),
    findGroups: vi.fn(async () =>
      (opts.groups ?? []).map((g) => ({ ...g, slug_suffix: null, member_count: 1 }))
    ),
    db: db as unknown as NotebookToolDeps['db'],
  };
  const tool = makeNotebooksTool({ state, sse, threadId: 'thread-1', sourceRegistry, deps });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { confirm: false, limit: 15, ...args },
      {}
    )) ?? {};
  return { run, notes, registered, sseEvents, helper, db, deps, sourceRegistry };
}

function card(sseEvents: Array<[string, unknown]>) {
  const found = sseEvents.find(([e]) => e === 'confirm_action');
  return found?.[1] as
    { type: string; metadata: Array<{ key: string; value: string }> } | undefined;
}

describe('list', () => {
  it('rows carry the id as ref so get/search can follow', async () => {
    const { run, registered } = makeCtx();
    const result = await run({ action: 'list' });
    expect(result.resultCount).toBe(1);
    expect(result.results).toEqual([
      {
        title: 'Kreisverband',
        url: '/notebooks/kreisverband-Ab3xK9',
        type: 'Notebook',
        snippet: 'Anträge und Protokolle',
        ref: 'n1',
      },
    ]);
    expect(registered).toHaveLength(1);
  });

  it('refuses without a signed-in person', async () => {
    const { run } = makeCtx({ userId: null });
    expect(String((await run({ action: 'list' })).error)).toContain('Nutzer-Sitzung');
  });
});

describe('get', () => {
  const withRows = () =>
    makeCtx({
      collection: collection({
        share_mode: 'groups',
        settings: {
          wolke_folders: [
            { shareLinkId: 'link-1', folderPath: 'Anträge/2026', folderName: '2026' },
          ],
          linked_docs: [{ docId: 'o1', docTitle: 'Protokoll' }],
        },
      }),
      query: (sql) => {
        if (sql.includes('FROM documents')) {
          return [
            { id: 'd1', title: 'Antrag Radweg' },
            { id: 'd2', title: 'Haushalt' },
          ];
        }
        if (sql.includes('group_content_shares')) return [{ id: 'g1', name: 'Fraktion' }];
        if (sql.includes('wolke_pending_files')) return [{ n: 3 }];
        return [];
      },
    });

  it('returns the details and one grounded block naming folders, groups and titles', async () => {
    const { run, registered, notes } = withRows();
    const result = await run({ action: 'get', id: 'n1' });
    const nb = result.notebook as Record<string, unknown>;
    expect(nb.documentCount).toBe(2);
    expect(nb.pendingCount).toBe(3);
    expect(nb.linkedDocCount).toBe(1);
    expect(nb.sharedGroups).toEqual([{ id: 'g1', name: 'Fraktion' }]);
    expect(nb.documents).toEqual([
      { id: 'd1', title: 'Antrag Radweg' },
      { id: 'd2', title: 'Haushalt' },
    ]);
    expect(notes).toHaveLength(0);
    expect(registered).toHaveLength(1);
    const text = (registered[0] as Array<{ content: string }>)[0].content;
    expect(text).toContain('2026 (Anträge/2026)');
    expect(text).toContain('Fraktion');
    expect(text).toContain('Antrag Radweg');
    expect(text).toContain('3 neue Datei(en)');
  });

  it('is readable for a share recipient', async () => {
    const { run } = makeCtx({ access: READER });
    const result = await run({ action: 'get', id: 'n1' });
    expect((result.notebook as Record<string, unknown>).isOwner).toBe(false);
  });

  it('does not exist for someone without access', async () => {
    const { run } = makeCtx({ access: DENIED });
    expect(String((await run({ action: 'get', id: 'n1' })).error)).toContain('kein Zugriff');
  });

  // Die Sammlung liegt in Qdrant, Titel/Freigaben/Warteschlange in Postgres.
  it('still answers when the postgres lookups fail', async () => {
    const { run } = makeCtx({
      query: () => {
        throw new Error('pg weg');
      },
    });
    const result = await run({ action: 'get', id: 'n1' });
    const nb = result.notebook as Record<string, unknown>;
    expect(nb.documentCount).toBe(2);
    expect(String(nb.note)).toContain('nicht laden');
  });
});

describe('search', () => {
  const answer = {
    ok: true as const,
    notebookName: 'Kreisverband',
    result: {
      success: true,
      answer: 'Der Radweg wird 2027 gebaut [1].',
      citations: [
        {
          index: '1',
          document_title: 'Antrag Radweg',
          document_id: 'd1',
          cited_text: 'Der Bau des Radwegs beginnt 2027.',
          source_url: null,
        },
      ],
      sources: [],
      allSources: [],
      metadata: {} as never,
    },
  };

  it('returns the answer and registers the citations as sources', async () => {
    const search = vi.fn(async () => answer);
    const { run, registered, notes } = makeCtx({ search });
    const result = await run({ action: 'search', id: 'n1', query: 'Wann kommt der Radweg?' });
    expect(search).toHaveBeenCalledWith({
      collectionId: 'n1',
      query: 'Wann kommt der Radweg?',
      userId: 'user-1',
    });
    expect(result.answer).toContain('2027');
    expect(result.resultCount).toBe(1);
    expect(result.sources).toBe('[1] Auszug');
    expect(notes).toHaveLength(0);
    const sources = registered[0] as Array<Record<string, unknown>>;
    expect(sources[0]).toMatchObject({
      source: 'notebook',
      title: 'Antrag Radweg',
      content: 'Der Bau des Radwegs beginnt 2027.',
      documentId: 'd1',
      collectionId: 'n1',
    });
  });

  it('turns an empty notebook into a note, not a source', async () => {
    const { run, registered, notes } = makeCtx({
      search: async () => ({ ok: false, error: 'Dieses Notebook enthält noch keine Dokumente.' }),
    });
    const result = await run({ action: 'search', id: 'n1', query: 'x' });
    expect(String(result.error)).toContain('keine Dokumente');
    expect(registered).toHaveLength(0);
    expect(notes).toHaveLength(1);
  });

  it('needs a query', async () => {
    const { run } = makeCtx();
    expect(String((await run({ action: 'search', id: 'n1' })).error)).toContain('query');
  });
});

describe('create', () => {
  it('creates an empty private notebook with the audience of the session', async () => {
    const { run, helper, notes } = makeCtx();
    const result = await run({ action: 'create', name: 'Wahlkampf 2026', description: ' Pläne ' });
    expect(result.ok).toBe(true);
    expect(result.notebook).toEqual({
      id: 'n-new',
      name: 'Wahlkampf 2026',
      url: '/notebooks/wahlkampf-2026-Zz9yX1',
    });
    expect(helper.storeNotebookCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        name: 'Wahlkampf 2026',
        description: 'Pläne',
        audience: 'de-AT',
        document_count: 0,
      })
    );
    expect(notes[0][1]).toContain('angelegt');
  });

  it('needs a name', async () => {
    const { run, helper } = makeCtx();
    expect(String((await run({ action: 'create' })).error)).toContain('name');
    expect(helper.storeNotebookCollection).not.toHaveBeenCalled();
  });

  // Ein Turn, der Änderungen ausschließt, darf keine bekommen — auch nicht direkt.
  it('is refused when the message rules out persistent changes', async () => {
    const { run, helper } = makeCtx({
      userText: 'Erstell dafür bitte kein Notebook, antworte nur im Chat.',
    });
    const result = await run({ action: 'create', name: 'Test' });
    expect(String(result.error)).toContain('schließt Änderungen aus');
    expect(helper.storeNotebookCollection).not.toHaveBeenCalled();
  });

  it('with wolkeFolder asks first and creates nothing on its own', async () => {
    const preview = vi.fn(async () => ({
      root: {
        connectionId: 'link-1',
        providerId: 'nextcloud-share' as const,
        label: 'Anträge',
        host: 'wolke.example',
        origin: 'own' as const,
        isActive: true,
        secret: 'https://wolke.example/s/AbC',
      },
      folderName: '2026',
      fileCount: 8,
      alreadyImported: 2,
    }));
    const { run, helper, sseEvents } = makeCtx({ preview });
    const result = await run({
      action: 'create',
      name: 'Anträge 2026',
      wolkeFolder: { connectionId: 'link-1', path: 'Anträge/2026' },
    });
    expect(preview).toHaveBeenCalledWith({
      userId: 'user-1',
      connectionId: 'link-1',
      folderPath: 'Anträge/2026',
      includeSubfolders: false,
    });
    expect(helper.storeNotebookCollection).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      needsConfirmation: true,
      fileCount: 8,
      alreadyImported: 2,
      willImportNow: 5,
      willQueue: 1,
    });
    const c = card(sseEvents);
    expect(c?.type).toBe('attach_wolke_folder');
    expect(c?.metadata).toContainEqual({ key: 'Notebook', value: 'Anträge 2026 (neu)' });
    expect(c?.metadata).toContainEqual({ key: 'Dateien', value: '8, davon 2 schon importiert' });
    expect(c?.metadata).toContainEqual({
      key: 'Jetzt',
      value: 'bis zu 5 sofort auslesen, 1 unter „Neue Dateien"',
    });
  });
});

describe('add_wolke_folder', () => {
  const ownPreview = () =>
    vi.fn(async () => ({
      root: {
        connectionId: 'link-1',
        providerId: 'nextcloud-share' as const,
        label: 'Anträge',
        host: 'wolke.example',
        origin: 'own' as const,
        isActive: true,
        secret: 'https://wolke.example/s/AbC',
      },
      folderName: 'Reden',
      fileCount: 3,
      alreadyImported: 0,
    }));

  it('emits the card with the existing collection', async () => {
    const { run, sseEvents } = makeCtx({ preview: ownPreview() });
    const result = await run({
      action: 'add_wolke_folder',
      id: 'n1',
      wolkeFolder: { path: 'Reden' },
    });
    expect(result.needsConfirmation).toBe(true);
    const c = card(sseEvents) as {
      payload?: unknown;
      metadata: Array<{ key: string; value: string }>;
    };
    expect(c.metadata).toContainEqual({ key: 'Notebook', value: 'Kreisverband' });
    expect(c.metadata).toContainEqual({ key: 'Jetzt', value: 'bis zu 3 sofort auslesen' });
  });

  it('is owner-only', async () => {
    const preview = ownPreview();
    const { run, sseEvents } = makeCtx({ access: EDITOR, preview });
    const result = await run({
      action: 'add_wolke_folder',
      id: 'n1',
      wolkeFolder: { path: 'Reden' },
    });
    expect(String(result.error)).toContain('Eigentümer');
    expect(preview).not.toHaveBeenCalled();
    expect(sseEvents).toHaveLength(0);
  });

  it('does not ask twice for a folder that is already attached', async () => {
    const { run, sseEvents } = makeCtx({
      preview: ownPreview(),
      collection: collection({
        settings: {
          wolke_folders: [{ shareLinkId: 'link-1', folderPath: 'Reden', folderName: 'Reden' }],
        },
      }),
    });
    const result = await run({
      action: 'add_wolke_folder',
      id: 'n1',
      wolkeFolder: { path: 'Reden' },
    });
    expect(result.alreadyAttached).toBe(true);
    expect(sseEvents).toHaveLength(0);
  });

  it('passes a preview error through (e.g. a group-shared connection)', async () => {
    const { run, sseEvents } = makeCtx({
      preview: async () => ({ error: 'Keine eigene aktive Verbindung mit der Id "link-9".' }),
    });
    const result = await run({
      action: 'add_wolke_folder',
      id: 'n1',
      wolkeFolder: { connectionId: 'link-9', path: 'Reden' },
    });
    expect(String(result.error)).toContain('link-9');
    expect(sseEvents).toHaveLength(0);
  });
});

describe('add_documents', () => {
  it('attaches owned documents and links office docs', async () => {
    const { run, helper } = makeCtx({
      query: (sql) => {
        // d1 hängt schon im Notebook — gehört der Person, wird aber nicht doppelt angehängt.
        if (sql.includes('FROM documents')) return [{ id: 'd3' }, { id: 'd1' }];
        if (sql.includes('collaborative_documents')) return [{ id: 'o1', title: 'Protokoll' }];
        return [];
      },
    });
    const result = await run({
      action: 'add_documents',
      id: 'n1',
      documentIds: ['d3', 'o1', 'd1'],
    });
    expect(result).toMatchObject({ ok: true, added: 1, linked: 1 });
    expect(helper.addDocumentsToCollection).toHaveBeenCalledWith('n1', ['d3'], 'user-1');
    const [, patch] = helper.updateNotebookCollection.mock.calls[0] as unknown as [
      string,
      { document_count: number; settings: { linked_docs: unknown[] } },
    ];
    expect(patch.document_count).toBe(3);
    expect(patch.settings.linked_docs).toEqual([
      { docId: 'o1', docTitle: 'Protokoll', documentId: null, lastSyncedAt: null },
    ]);
    expect(String(result.note)).toContain('Synchronisieren');
  });

  it('names ids that are not the caller’s', async () => {
    const { run, helper } = makeCtx({ query: () => [] });
    const result = await run({ action: 'add_documents', id: 'n1', documentIds: ['fremd'] });
    expect(String(result.error)).toContain('fremd');
    expect(helper.addDocumentsToCollection).not.toHaveBeenCalled();
  });

  it('needs edit rights', async () => {
    const { run } = makeCtx({ access: READER });
    const result = await run({ action: 'add_documents', id: 'n1', documentIds: ['d3'] });
    expect(String(result.error)).toContain('Berechtigung');
  });
});

describe('rename', () => {
  it('works for an editor of a shared notebook', async () => {
    const { run, helper } = makeCtx({ access: EDITOR });
    const result = await run({ action: 'rename', id: 'n1', name: 'Neu' });
    expect(result.ok).toBe(true);
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n1', { name: 'Neu' });
  });

  it('is refused for a reader', async () => {
    const { run, helper } = makeCtx({ access: READER });
    expect(String((await run({ action: 'rename', id: 'n1', name: 'Neu' })).error)).toContain(
      'Berechtigung'
    );
    expect(helper.updateNotebookCollection).not.toHaveBeenCalled();
  });
});

describe('set_visibility', () => {
  it('emits the card with the resulting state, explaining „Mit Anmeldung"', async () => {
    const { run, sseEvents, helper } = makeCtx();
    const result = await run({ action: 'set_visibility', id: 'n1', shareMode: 'authenticated' });
    expect(result.needsConfirmation).toBe(true);
    expect(helper.updateNotebookCollection).not.toHaveBeenCalled();
    const c = card(sseEvents) as {
      type: string;
      description: string;
      metadata: Array<{ key: string; value: string }>;
    };
    expect(c.type).toBe('set_notebook_visibility');
    expect(c.description).toContain('alle angemeldeten Personen dieser Instanz');
    expect(c.metadata).toContainEqual({
      key: 'Sichtbarkeit',
      value: 'Mit Anmeldung (alle angemeldeten Personen dieser Instanz)',
    });
    expect(c.metadata).toContainEqual({ key: 'Bearbeiten', value: 'nur Eigentümer*in' });
  });

  it('refuses an invalid combination before the card', async () => {
    const { run, sseEvents } = makeCtx();
    const result = await run({ action: 'set_visibility', id: 'n1', isPublic: true });
    expect(String(result.error)).toContain('Quelle der Inhalte');
    expect(sseEvents).toHaveLength(0);
  });

  it('is owner-only', async () => {
    const { run } = makeCtx({ access: EDITOR });
    const result = await run({ action: 'set_visibility', id: 'n1', shareMode: 'groups' });
    expect(String(result.error)).toContain('Eigentümer');
  });
});

describe('share_to_group', () => {
  it('emits the card for a group the person is a member of', async () => {
    const { run, sseEvents } = makeCtx({
      groups: [
        { id: 'g-public', name: 'Fraktion offen', role: '' },
        { id: 'g1', name: 'Fraktion', role: 'member' },
      ],
    });
    const result = await run({ action: 'share_to_group', id: 'n1', groupName: 'Fraktion' });
    expect(result.needsConfirmation).toBe(true);
    const c = card(sseEvents);
    expect(c?.type).toBe('share_notebook');
    expect(c?.metadata).toContainEqual({ key: 'Projekt', value: 'Fraktion' });
  });

  it('never falls back to a public group without membership', async () => {
    const { run, sseEvents } = makeCtx({
      groups: [{ id: 'g-public', name: 'Fraktion', role: '' }],
    });
    const result = await run({ action: 'share_to_group', id: 'n1', groupName: 'Fraktion' });
    expect(String(result.error)).toContain('angehörst');
    expect(sseEvents).toHaveLength(0);
  });
});

describe('delete', () => {
  it('needs a two-step confirm', async () => {
    const { run, helper } = makeCtx();
    const first = await run({ action: 'delete', id: 'n1' });
    expect(first.needsConfirmation).toBe(true);
    expect(helper.deleteNotebookCollection).not.toHaveBeenCalled();
    const second = await run({ action: 'delete', id: 'n1', confirm: true });
    expect(second.ok).toBe(true);
    expect(helper.deleteNotebookCollection).toHaveBeenCalledWith('n1');
  });

  it('is owner-only', async () => {
    const { run, helper } = makeCtx({ access: EDITOR });
    await run({ action: 'delete', id: 'n1', confirm: true });
    expect(helper.deleteNotebookCollection).not.toHaveBeenCalled();
  });
});

/**
 * Gegen die ECHTE Registry: wo `renderAll()` den Text hinschreibt und was
 * `freshSize` sagt, entscheidet in `buildSynthSystem`, ob der Schreiber die
 * Anweisung bekommt, er habe nicht recherchiert (`carriedOnly`).
 */
describe('was der Schreiber im split-Modus wirklich sieht', () => {
  it('puts the notebook details into the citable sources, not into VORGÄNGE', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'get', id: 'n1' });
    expect(registry.freshSize).toBe(1);
    const block = registry.renderAll();
    expect(block).toContain('Kreisverband');
    expect(block).not.toContain('VORGÄNGE IN DIESEM TURN');
  });

  it('puts the cited passages of a search into the sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({
      registry,
      search: async () => ({
        ok: true,
        notebookName: 'Kreisverband',
        result: {
          success: true,
          answer: 'Antwort [1]',
          citations: [
            { index: '1', document_title: 'Antrag Radweg', cited_text: 'Der Radweg kommt 2027.' },
          ],
          sources: [],
          allSources: [],
          metadata: {} as never,
        },
      }),
    });
    await run({ action: 'search', id: 'n1', query: 'Radweg?' });
    expect(registry.freshSize).toBe(1);
    expect(registry.renderAll()).toContain('Der Radweg kommt 2027.');
  });

  it('keeps a confirmation request in the VORGÄNGE block and out of the sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'delete', id: 'n1' });
    expect(registry.freshSize).toBe(0);
    expect(registry.renderAll()).toContain('VORGÄNGE IN DIESEM TURN');
  });
});
