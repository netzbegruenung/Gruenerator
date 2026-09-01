/**
 * `groups` gegen Fakes für Abfragen, Inhalte und Mutationen — kein Postgres.
 * Alles kommt über `ctx.deps` herein, wie bei `notebookTools.vitest.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { groupContentRows, makeGroupsTool, type GroupToolDeps } from './groupTools.js';

// `emitToolConfirmAction` legt die Karte in Redis ab; ohne erreichbares Redis
// antwortet der Client nie. Gemockt wird nur der Speicher, die Karte samt
// `CONFIRM_ACTION_CONFIG`-Eintrag bleibt echt.
vi.mock('../services/pendingActionStore.js', () => ({
  pendingActionStore: { store: async () => {} },
}));

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { GroupContentBuckets } from '../../../services/groups/groupContent.js';
import type { GroupDetailRow, UserGroupRow } from '../../../services/groups/groupQueries.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

function detail(over: Partial<GroupDetailRow> = {}): GroupDetailRow {
  return {
    id: 'g1',
    name: 'Klima-AG',
    description: 'Für den Klimaschutz',
    slug_suffix: 'ab12cd',
    is_public: false,
    audience: 'de-DE',
    group_type: 'standard',
    role: 'admin',
    isAdmin: true,
    member_count: 7,
    ...over,
  };
}

function emptyBuckets(over: Partial<GroupContentBuckets> = {}): GroupContentBuckets {
  return {
    documents: [],
    generators: [],
    notebooks: [],
    texts: [],
    templates: [],
    collaborative_documents: [],
    system_notebooks: [],
    system_agents: [],
    user_agents: [],
    canvas_templates: [],
    ...over,
  };
}

interface CtxOptions {
  userId?: string | null;
  threadId?: string | null;
  group?: GroupDetailRow | null;
  memberships?: UserGroupRow[];
  found?: UserGroupRow[];
  buckets?: GroupContentBuckets;
  contentCount?: number;
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
    messages: opts.userText ? [{ role: 'user', content: opts.userText }] : [],
  } as unknown as ChatGraphState;

  const group = opts.group === undefined ? detail() : opts.group;
  const deps: GroupToolDeps = {
    listUserGroups: vi.fn(async () => opts.memberships ?? []),
    findGroups: vi.fn(async () => opts.found ?? []),
    getGroupByToken: vi.fn(async () => null),
    getGroupForMember: vi.fn(async () => group),
    countGroupContent: vi.fn(async () => opts.contentCount ?? 0),
    hydrateGroupContent: vi.fn(async () => opts.buckets ?? emptyBuckets()),
    updateGroupInfo: vi.fn(async () => ({
      status: 200 as const,
      success: true,
      message: 'Gruppendetails erfolgreich aktualisiert.',
    })),
  };
  const tool = makeGroupsTool({
    state,
    sse,
    threadId: opts.threadId === undefined ? 'thread-1' : opts.threadId,
    sourceRegistry,
    deps,
  });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { limit: 15, ...args },
      {}
    )) ?? {};
  return { run, notes, registered, sseEvents, deps };
}

const member = (over: Partial<UserGroupRow> = {}): UserGroupRow => ({
  id: 'g1',
  name: 'Klima-AG',
  slug_suffix: 'ab12cd',
  role: 'member',
  member_count: 7,
  ...over,
});

describe('groups: list / find', () => {
  it('refuses without a session', async () => {
    const { run } = makeCtx({ userId: null });
    expect(await run({ action: 'list' })).toMatchObject({
      error: expect.stringMatching(/Sitzung/),
    });
  });

  it('list maps memberships to rows with the id as ref', async () => {
    const { run } = makeCtx({ memberships: [member({ role: 'admin' })] });
    const out = (await run({ action: 'list' })) as {
      results: Array<{ title: string; url: string; ref?: string; snippet?: string }>;
    };
    expect(out.results[0].title).toBe('Klima-AG');
    expect(out.results[0].url).toBe('/gruppen/klima-ag-ab12cd');
    expect(out.results[0].ref).toBe('g1');
    expect(out.results[0].snippet).toContain('admin');
  });

  it('find needs a query and returns public matches too', async () => {
    const { run } = makeCtx({ found: [member({ id: 'g9', name: 'Offen', role: '' })] });
    expect(await run({ action: 'find' })).toMatchObject({
      error: expect.stringMatching(/Suchbegriff/),
    });
    const out = (await run({ action: 'find', query: 'Offen' })) as { resultCount: number };
    expect(out.resultCount).toBe(1);
  });
});

describe('groups: Auflösung über groupId / groupName', () => {
  it('needs one of the two', async () => {
    const { run } = makeCtx();
    expect(await run({ action: 'get' })).toMatchObject({ error: expect.stringMatching(/groupId/) });
  });

  it('groupId of a group the person is not in → not found, no detail leak', async () => {
    const { run, deps } = makeCtx({ group: null });
    const out = await run({ action: 'get', groupId: 'g-foreign' });
    expect(out.error).toMatch(/kein Mitglied/);
    expect(deps.countGroupContent).not.toHaveBeenCalled();
  });

  it('groupName only resolves to groups the person is a MEMBER of', async () => {
    // findGroups liefert auch öffentliche Fremdgruppen mit leerer Rolle.
    const { run, deps } = makeCtx({ found: [member({ id: 'g9', name: 'Klima-AG', role: '' })] });
    const out = await run({ action: 'get', groupName: 'Klima-AG' });
    expect(out.error).toMatch(/angehörst/);
    expect(deps.getGroupForMember).not.toHaveBeenCalled();
  });

  it('groupName prefers the exact match over a longer sibling', async () => {
    const { run, deps } = makeCtx({
      found: [member({ id: 'g2', name: 'Klima-AG Nord' }), member({ id: 'g1', name: 'Klima-AG' })],
    });
    await run({ action: 'get', groupName: 'klima-ag' });
    expect(deps.getGroupForMember).toHaveBeenCalledWith('g1', 'user-1');
  });

  it('groupName with several partial matches asks for the id', async () => {
    const { run } = makeCtx({
      found: [member({ id: 'g2', name: 'Klima Nord' }), member({ id: 'g3', name: 'Klima Süd' })],
    });
    const out = await run({ action: 'get', groupName: 'Klima' });
    expect(out.error).toMatch(/Mehrere Projekte/);
    expect(out.error).toContain('g2');
  });
});

describe('groups: get', () => {
  it('returns the details and grounds ONE source block with the url', async () => {
    const { run, registered } = makeCtx({ contentCount: 3 });
    const out = (await run({ action: 'get', groupId: 'g1' })) as { group: Record<string, unknown> };
    expect(out.group).toMatchObject({
      id: 'g1',
      name: 'Klima-AG',
      url: '/gruppen/klima-ag-ab12cd',
      isAdmin: true,
      memberCount: 7,
      isPublic: false,
      contentCount: 3,
    });
    expect(registered).toHaveLength(1);
    const [block] = registered[0] as Array<{ title: string; content: string; url: string }>;
    expect(block.title).toBe('Projekt: Klima-AG');
    expect(block.url).toBe('/gruppen/klima-ag-ab12cd');
    expect(block.content).toContain('Für den Klimaschutz');
    expect(block.content).toContain('3 geteilte');
    expect(block.content).toContain('privat');
  });

  it('names the audience of a public group', async () => {
    const { run, registered } = makeCtx({ group: detail({ is_public: true, audience: 'de-AT' }) });
    await run({ action: 'get', groupId: 'g1' });
    const [block] = registered[0] as Array<{ content: string }>;
    expect(block.content).toContain('öffentlich gelistet (Österreich)');
  });
});

describe('groups: content', () => {
  const buckets = emptyBuckets({
    collaborative_documents: [
      { id: 'd1', title: 'Protokoll', document_subtype: 'docs', shared_by_name: 'Anna' },
      { id: 'b1', title: 'Wahlkampf', document_subtype: 'boards', shared_by_name: 'Unknown User' },
    ],
    notebooks: [{ id: 'n1', name: 'Kreisverband', slug_suffix: 'Ab3xK9', description: 'Anträge' }],
    user_agents: [{ id: 'ua-1', identifier: 'klima-bot', title: 'Klima-Bot' }],
    documents: [{ id: 'f1', title: null, filename: 'satzung.pdf' }],
    texts: [{ id: 't1', title: 'Rede', word_count: 812 }],
  });

  it('turns every bucket into rows with the page url per kind', async () => {
    const { run, registered } = makeCtx({ buckets });
    const out = (await run({ action: 'content', groupId: 'g1' })) as {
      project: string;
      resultCount: number;
      results: Array<{ title: string; url: string; type: string; snippet?: string }>;
    };
    expect(out.project).toBe('Klima-AG');
    expect(out.resultCount).toBe(6);
    expect(out.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Protokoll',
          url: '/office/d1',
          snippet: 'geteilt von Anna',
        }),
        expect.objectContaining({ title: 'Wahlkampf', url: '/boards/b1' }),
        expect.objectContaining({ title: 'Kreisverband', url: '/notebooks/kreisverband-Ab3xK9' }),
        expect.objectContaining({ title: 'Klima-Bot', url: '/agents/klima-bot' }),
        expect.objectContaining({ title: 'satzung.pdf', url: '/documents/f1' }),
        expect.objectContaining({
          title: 'Rede',
          url: '/gruppen/klima-ag-ab12cd',
          snippet: '812 Wörter',
        }),
      ])
    );
    expect(registered).toHaveLength(1);
  });

  it('caps at limit and reports the total', async () => {
    const { run } = makeCtx({ buckets });
    const out = (await run({ action: 'content', groupId: 'g1', limit: 2 })) as {
      resultCount: number;
      total?: number;
    };
    expect(out.resultCount).toBe(2);
    expect(out.total).toBe(6);
  });

  it('an empty project yields a note instead of an empty citation list', async () => {
    const { run, notes, registered } = makeCtx();
    const out = await run({ action: 'content', groupId: 'g1' });
    expect(out.resultCount).toBe(0);
    expect(out.note).toMatch(/nichts geteilt/);
    expect(notes).toHaveLength(1);
    expect(registered).toHaveLength(0);
  });

  /**
   * Der Freigabe-Link einer Wolke-Verbindung IST das Zugangsmittel. Die
   * Hydration kennt keinen Bucket dafür; und was ein Bucket sonst mitbringt
   * (Berechtigungen, Besitzer-IDs, Rohinhalt) darf ebenfalls nicht in die
   * Zeilen — sie tragen nur Titel, URL, Typ, Snippet.
   */
  it('rows never carry a share link or other raw bucket fields', () => {
    const rows = groupContentRows(
      emptyBuckets({
        templates: [
          {
            id: 'tpl',
            title: 'Vorlage',
            share_link: 'https://wolke.example/s/SECRET',
            group_permissions: { read: true },
            user_id: 'owner-9',
          },
        ],
        texts: [{ id: 't1', title: 'Rede', content: '<p>Geheimer Volltext</p>' }],
      }),
      '/gruppen/x'
    );
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('SECRET');
    expect(dump).not.toContain('owner-9');
    expect(dump).not.toContain('Geheimer Volltext');
    expect(dump).not.toContain('group_permissions');
    expect(rows.map((r) => Object.keys(r).sort())).toEqual([
      ['title', 'type', 'url'],
      ['title', 'type', 'url'],
    ]);
  });
});

describe('groups: create / join (Karten, unverändert)', () => {
  it('create without a name → error, no card', async () => {
    const { run, sseEvents } = makeCtx();
    const out = await run({ action: 'create' });
    expect(out.error).toMatch(/name/);
    expect(sseEvents).toHaveLength(0);
  });

  it('create emits a create_group card with name + description', async () => {
    const { run, sseEvents } = makeCtx();
    const out = await run({
      action: 'create',
      name: 'Klima-AG',
      description: 'Für den Klimaschutz',
    });
    expect(out.ok).toBe(true);
    const [event, payload] = sseEvents[0] as [string, { type: string }];
    expect(event).toBe('confirm_action');
    expect(payload.type).toBe('create_group');
  });

  it('create is refused on a turn that rules out persistent changes', async () => {
    const { run, sseEvents } = makeCtx({ userText: 'Nur im Chat antworten, nichts speichern.' });
    const out = await run({ action: 'create', name: 'Klima-AG' });
    expect(out.error).toMatch(/schließt Änderungen aus/);
    expect(sseEvents).toHaveLength(0);
  });

  it('join with an unknown token → error, no card', async () => {
    const { run, sseEvents } = makeCtx();
    const out = await run({ action: 'join', joinToken: 'deadbeef' });
    expect(out.error).toMatch(/Einladungslink/);
    expect(sseEvents).toHaveLength(0);
  });

  it('join emits a join_group card naming the resolved group', async () => {
    const { run, sseEvents, deps } = makeCtx();
    (deps.getGroupByToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'g1',
      name: 'Klima',
    });
    const out = await run({ action: 'join', joinToken: 'tok123' });
    expect(out.ok).toBe(true);
    expect(deps.getGroupByToken).toHaveBeenCalledWith('tok123');
    const [, payload] = sseEvents[0] as [string, { type: string; metadata: unknown[] }];
    expect(payload.type).toBe('join_group');
    expect(payload.metadata).toEqual([{ key: 'Gruppe', value: 'Klima' }]);
  });
});

describe('groups: update', () => {
  it('needs name or description', async () => {
    const { run, deps } = makeCtx();
    const out = await run({ action: 'update', groupId: 'g1' });
    expect(out.error).toMatch(/name oder description/);
    expect(deps.updateGroupInfo).not.toHaveBeenCalled();
  });

  it('is admin-only — a member gets refused before the service is called', async () => {
    const { run, deps } = makeCtx({ group: detail({ role: 'member', isAdmin: false }) });
    const out = await run({ action: 'update', groupId: 'g1', name: 'Neu' });
    expect(out.error).toMatch(/Admin/);
    expect(deps.updateGroupInfo).not.toHaveBeenCalled();
  });

  it('renames directly (no card) and notes the outcome', async () => {
    const { run, deps, notes, sseEvents } = makeCtx();
    const out = await run({ action: 'update', groupId: 'g1', name: ' Klima-AG Nord ' });
    expect(out.ok).toBe(true);
    expect(deps.updateGroupInfo).toHaveBeenCalledWith('g1', 'user-1', { name: 'Klima-AG Nord' });
    expect(sseEvents).toHaveLength(0);
    expect(notes[0][1]).toContain('heißt jetzt „Klima-AG Nord"');
  });

  it('an empty description clears the field', async () => {
    const { run, deps } = makeCtx();
    await run({ action: 'update', groupId: 'g1', description: '' });
    expect(deps.updateGroupInfo).toHaveBeenCalledWith('g1', 'user-1', { description: null });
  });

  it('passes the service refusal through as error', async () => {
    const { run, deps } = makeCtx();
    (deps.updateGroupInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 400,
      success: false,
      message: 'Gruppenname darf nicht leer sein.',
    });
    const out = await run({ action: 'update', groupId: 'g1', name: 'x' });
    expect(out.error).toBe('Gruppenname darf nicht leer sein.');
  });

  it('is refused on a turn that rules out persistent changes', async () => {
    const { run, deps } = makeCtx({ userText: 'Bitte keine Aktion ausführen, nur erklären.' });
    const out = await run({ action: 'update', groupId: 'g1', name: 'Neu' });
    expect(out.error).toMatch(/schließt Änderungen aus/);
    expect(deps.updateGroupInfo).not.toHaveBeenCalled();
  });
});

describe('groups: set_visibility', () => {
  it('needs isPublic', async () => {
    const { run, sseEvents } = makeCtx();
    const out = await run({ action: 'set_visibility', groupId: 'g1' });
    expect(out.error).toMatch(/isPublic/);
    expect(sseEvents).toHaveLength(0);
  });

  it('is admin-only', async () => {
    const { run, sseEvents } = makeCtx({ group: detail({ role: 'member', isAdmin: false }) });
    const out = await run({ action: 'set_visibility', groupId: 'g1', isPublic: true });
    expect(out.error).toMatch(/Admin/);
    expect(sseEvents).toHaveLength(0);
  });

  it('emits a set_group_visibility card with the payload the executor needs', async () => {
    const { run, sseEvents, notes } = makeCtx();
    const out = await run({
      action: 'set_visibility',
      groupId: 'g1',
      isPublic: true,
      audience: 'all',
    });
    expect(out).toMatchObject({ ok: true, needsConfirmation: true });
    const [event, payload] = sseEvents[0] as [
      string,
      { type: string; title: string; metadata: Array<{ key: string; value: string }> },
    ];
    expect(event).toBe('confirm_action');
    expect(payload.type).toBe('set_group_visibility');
    expect(payload.title).toBe('Sichtbarkeit des Projekts ändern');
    expect(payload.metadata).toEqual([
      { key: 'Projekt', value: 'Klima-AG' },
      { key: 'Sichtbarkeit', value: 'Öffentlich gelistet' },
      { key: 'Zielgruppe', value: 'Deutschland und Österreich' },
    ]);
    expect(notes[0][1]).toContain('Bestätigung angefordert');
  });

  it('keeps the current audience when none is given', async () => {
    const { run, sseEvents } = makeCtx({ group: detail({ audience: 'de-AT' }) });
    await run({ action: 'set_visibility', groupId: 'g1', isPublic: true });
    const [, payload] = sseEvents[0] as [
      string,
      { metadata: Array<{ key: string; value: string }> },
    ];
    expect(payload.metadata).toContainEqual({ key: 'Zielgruppe', value: 'Österreich' });
  });

  it('a no-op change is a note, not a card', async () => {
    const { run, sseEvents, notes } = makeCtx({ group: detail({ is_public: false }) });
    const out = await run({ action: 'set_visibility', groupId: 'g1', isPublic: false });
    expect(out.ok).toBe(true);
    expect(sseEvents).toHaveLength(0);
    expect(notes[0][1]).toContain('schon');
  });

  it('refuses to list a personal space', async () => {
    const { run, sseEvents } = makeCtx({ group: detail({ group_type: 'personal' }) });
    const out = await run({ action: 'set_visibility', groupId: 'g1', isPublic: true });
    expect(out.error).toMatch(/persönlicher Space/);
    expect(sseEvents).toHaveLength(0);
  });

  it('is refused outside a thread', async () => {
    const { run, sseEvents } = makeCtx({ threadId: null });
    const out = await run({ action: 'set_visibility', groupId: 'g1', isPublic: true });
    expect(out.error).toMatch(/Kontext/);
    expect(sseEvents).toHaveLength(0);
  });
});

/**
 * Gegen die ECHTE Registry: wo `renderAll()` den Text hinschreibt und was
 * der Schreiber im split-Modus davon sieht — er liest nur diesen Block.
 */
describe('was der Schreiber im split-Modus wirklich sieht', () => {
  it('puts the project details into the citable sources, not into VORGÄNGE', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry, contentCount: 2 });
    await run({ action: 'get', groupId: 'g1' });
    expect(registry.freshSize).toBe(1);
    const block = registry.renderAll();
    expect(block).toContain('Klima-AG');
    expect(block).toContain('/gruppen/klima-ag-ab12cd');
    expect(block).not.toContain('VORGÄNGE IN DIESEM TURN');
  });

  it('puts the shared content rows into the sources with their links', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({
      registry,
      buckets: emptyBuckets({
        collaborative_documents: [{ id: 'd1', title: 'Protokoll', document_subtype: 'docs' }],
      }),
    });
    await run({ action: 'content', groupId: 'g1' });
    expect(registry.freshSize).toBe(1);
    expect(registry.renderAll()).toContain('Protokoll');
  });

  it('reports a rename as a VORGANG, not as a source', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'update', groupId: 'g1', name: 'Neu' });
    expect(registry.freshSize).toBe(0);
    expect(registry.renderAll()).toContain('VORGÄNGE IN DIESEM TURN');
    expect(registry.renderAll()).toContain('heißt jetzt „Neu"');
  });
});
