/**
 * `notebook_quellen` auf System-Notebooks — jede Aktion gegen den Qdrant-Fake
 * aus `fakeSystemCollection.ts`. Die Landesverbände Saarland und Berlin teilen
 * sich `landesverbaende_documents`; eine Berliner URL im Saarland-Notebook ist
 * der Prüfstein der Zugehörigkeitsregel.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  fakeDoc,
  fakeSearchDoc,
  makeSystemDeps,
  type FakePoint,
} from '../../../services/notebook/__fixtures__/fakeSystemCollection.js';
import { SYSTEM_READ_ONLY } from '../../../services/notebook/systemNotebookSources.js';
import { buildToolObservationReplay } from '../services/agenticLoop/mcpReplay.js';

import {
  boundSystemNotebook,
  makeNotebookSourcesTool,
  normalizeArgs,
  notebookForPrompt,
  notebookIdFromSteps,
  type NotebookSourceToolDeps,
} from './notebookSourceTools.js';
import { type NotebookSourceWriteDeps } from './notebookSourceWriteActions.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { DocumentResult } from '../../../services/BaseSearchService/types.js';
import type { StatsNlp } from '../../../services/notebook/sourceStats.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, any>;

const WOLKE_LINK = 'https://wolke.netzbegruenung.de/s/TESTTOKEN#/';
vi.mock('../../../services/scrapers/utils/wolkeShareSecrets.js', () => ({
  resolveWolkeDisplayUrl: (url: string) => url.replace('wolke://hh-share/', WOLKE_LINK),
  toStoredWolkeUrl: (url: string) => url.replace(WOLKE_LINK, 'wolke://hh-share/'),
}));

const LV = 'landesverbaende_documents';
const SL_A = 'https://gruene-saar.de/a';
const SL_B = 'https://gruene-saar.de/b';
const BE_A = 'https://gruene.berlin/a';
const AT_A = 'https://gruene.at/programm';

function points(): FakePoint[] {
  return [
    ...fakeDoc(
      LV,
      SL_A,
      ['Saarland baut Radwege.', 'Die Wärmepumpe kommt. Wärmepumpe überall.'],
      { landesverband: 'SL', title: 'Radverkehr', published_at: '2025-03-01' },
      { pages: [1, 2] }
    ),
    ...fakeDoc(LV, SL_B, ['Hafen und Klima.'], {
      landesverband: 'SL',
      title: 'Hafen',
      published_at: '2026-01-15',
    }),
    ...fakeDoc(LV, BE_A, ['Berlin Wärmepumpe.'], {
      landesverband: 'BE',
      title: 'Mieten',
      published_at: '2026-05-01',
    }),
    ...fakeDoc('oesterreich_gruene_documents', AT_A, ['Klimaschutz in Österreich.'], {
      title: 'Grundsatzprogramm AT',
    }),
  ];
}

function makeCtx(
  opts: {
    notebookIds?: string[];
    locale?: 'de-DE' | 'de-AT';
    searchResults?: DocumentResult[];
    nlp?: StatsNlp;
    recentSteps?: PersistedStep[];
    /** Eine Saarlander Quelle ohne Datum. */
    extraPoints?: boolean;
    /** Weitere Saarlander Quellen — über SYSTEM_SCAN_MAX_SOURCES geht grep an den Index. */
    more?: FakePoint[];
    textIndex?: Record<string, unknown> | null;
    scopeLock?: { ids: string[]; readOnly: boolean };
    /** Das Notebook, an das der Agent gebunden ist (`defaultNotebookIds`). */
    agentNotebookIds?: string[];
    allowedCollections?: string[];
    systemOnly?: boolean;
  } = {}
) {
  const registered: Array<Record<string, any>> = [];
  const notes: Array<[string, string]> = [];
  const sourceRegistry = {
    note: (title: string, content: string) => notes.push([title, content]),
    register: (results: Array<Record<string, any>>) => {
      registered.push(...results);
      return '[1] Auszug';
    },
  } as unknown as SourceRegistry;
  const state = {
    agentConfig: {
      userId: 'user-1',
      ...(opts.agentNotebookIds ? { defaultNotebookIds: opts.agentNotebookIds } : {}),
      ...(opts.allowedCollections
        ? { toolRestrictions: { allowedCollections: opts.allowedCollections } }
        : {}),
    },
    userLocale: opts.locale ?? 'de-DE',
    messages: [],
    notebookIds: opts.notebookIds ?? [],
    ...(opts.scopeLock ? { notebookScopeLock: opts.scopeLock } : {}),
  } as unknown as ChatGraphState;
  const undated = opts.extraPoints
    ? fakeDoc(LV, 'https://gruene-saar.de/ohne-datum', ['Hafen ohne Datum.'], {
        landesverband: 'SL',
        title: 'Ohne Datum',
      })
    : [];
  const system = makeSystemDeps([...points(), ...undated, ...(opts.more ?? [])], {
    ...(opts.searchResults ? { searchResults: opts.searchResults } : {}),
    ...(opts.textIndex !== undefined ? { textIndex: opts.textIndex } : {}),
  });
  const helper = {
    getNotebookCollection: vi.fn(async () => null),
    getCollectionDocuments: vi.fn(async () => []),
    isDocumentInCollection: vi.fn(async () => false),
  };
  const deps = {
    helper,
    db: { query: vi.fn(async () => []) },
    access: vi.fn(),
    rerank: system.rerank,
    scrollPage: system.scrollPage,
    chunkTextIndex: system.chunkTextIndex,
    documentService: system.deps.documentService,
    recentSteps: vi.fn(async () => opts.recentSteps ?? []),
    ...(opts.nlp ? { nlp: opts.nlp } : {}),
  } as unknown as NotebookSourceToolDeps & NotebookSourceWriteDeps;
  const tool = makeNotebookSourcesTool(
    {
      state,
      sse: { send: () => {} } as unknown as SSEWriter,
      threadId: 't1',
      sourceRegistry,
      deps,
    },
    { systemOnly: opts.systemOnly === true }
  );
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { mode: 'hybrid', rerank: false, ...args },
      {}
    )) ?? {};
  return { run, registered, notes, helper, system, deps };
}

describe('resolution', () => {
  it('accepts a collection key, a system id and a selected notebook slug', async () => {
    const byKey = makeCtx();
    const out = await byKey.run({ action: 'list', notebookId: 'saarland' });
    expect(out.collection).toBe('saarland');
    expect(byKey.helper.getNotebookCollection).not.toHaveBeenCalled();

    const bySystemId = makeCtx();
    expect(
      (await bySystemId.run({ action: 'list', notebookId: 'saarland-system' })).collection
    ).toBe('saarland');

    const bySlug = makeCtx({ notebookIds: ['saarland-notebook'] });
    expect((await bySlug.run({ action: 'list' })).collection).toBe('saarland');
  });

  it('refuses a key outside the locale set — DE user, Austrian corpus', async () => {
    const { run, system } = makeCtx();
    const out = await run({ action: 'list', notebookId: 'oesterreich' });
    expect(out.error).toMatch(/^Das System-Notebook „oesterreich" steht hier nicht zur Verfügung/);
    expect(system.scrollPage).not.toHaveBeenCalled();
  });

  it('gives an AT user the AT corpus and refuses a German Landesverband', async () => {
    const { run, system } = makeCtx({ locale: 'de-AT' });
    const at = await run({ action: 'list', notebookId: 'oesterreich' });
    expect(at.results.map((r: any) => r.url)).toEqual([AT_A]);
    expect(system.scrollPage.mock.calls[0]![0]).toBe('oesterreich_gruene_documents');
    expect((await run({ action: 'list', notebookId: 'saarland' })).error).toMatch(
      /steht hier nicht zur Verfügung/
    );
  });

  it('prefers a selected user notebook, then a resolvable system notebook', async () => {
    const { run } = makeCtx({ notebookIds: ['gruenerator-notebook', 'saarland-notebook'] });
    expect((await run({ action: 'list' })).collection).toBe('saarland');
  });

  it('asks for one key when a slug covers several collections', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'list', notebookId: 'gruenerator-notebook' })).error).toMatch(
      /mehrere Sammlungen/
    );
  });

  it('refuses write actions on a system notebook, as source and as move target', async () => {
    const byKey = makeCtx();
    expect(
      await byKey.run({ action: 'remove', notebookId: 'saarland', sourceIds: [SL_A] })
    ).toEqual({ error: SYSTEM_READ_ONLY });
    expect(byKey.system.scrollPage).not.toHaveBeenCalled();

    const bySelection = makeCtx({ notebookIds: ['saarland-notebook'] });
    expect(
      await bySelection.run({ action: 'add_note', title: 'Notiz', text: 'x'.repeat(40) })
    ).toEqual({ error: SYSTEM_READ_ONLY });

    const intoSystem = makeCtx();
    intoSystem.helper.getNotebookCollection.mockImplementation((async (id: string) =>
      id === 'nb-1' ? { id: 'nb-1', name: 'Eigenes', user_id: 'user-1' } : null) as never);
    vi.mocked(intoSystem.deps.access).mockResolvedValue({
      exists: true,
      isOwner: true,
      canRead: true,
      canEdit: true,
    } as never);
    expect(
      await intoSystem.run({
        action: 'move',
        notebookId: 'nb-1',
        sourceIds: ['d1'],
        targetNotebookId: 'saarland',
      })
    ).toEqual({ error: SYSTEM_READ_ONLY });
    expect(intoSystem.helper.getCollectionDocuments).not.toHaveBeenCalled();
  });
});

describe('Agent mit eigenem Notebook', () => {
  it('nimmt ohne notebookId das Notebook des Agenten', async () => {
    const { run } = makeCtx({ agentNotebookIds: ['hamburg-notebook'] });
    expect((await run({ action: 'list' })).collection).toBe('hamburg');
  });

  it('lässt ein ausgewähltes Notebook vor dem des Agenten gelten', async () => {
    const { run } = makeCtx({
      agentNotebookIds: ['hamburg-notebook'],
      notebookIds: ['berlin-notebook'],
    });
    expect((await run({ action: 'list' })).collection).toBe('berlin');
  });

  it('hält sich an die Sammlungsliste des Agenten', async () => {
    const { run } = makeCtx({
      agentNotebookIds: ['hamburg-notebook'],
      allowedCollections: ['hamburg'],
    });
    expect((await run({ action: 'list', notebookId: 'berlin' })).error).toMatch(
      /steht hier nicht zur Verfügung/
    );
  });

  it('liest ohne user_content nur System-Notebooks und fragt kein eigenes nach', async () => {
    const { run, helper } = makeCtx({ agentNotebookIds: ['hamburg-notebook'], systemOnly: true });
    expect((await run({ action: 'list' })).collection).toBe('hamburg');
    const own = await run({ action: 'list', notebookId: '6f1c2e9a-0000-4000-8000-000000000001' });
    expect(own.error).toMatch(/nur System-Notebooks/);
    expect(helper.getNotebookCollection).not.toHaveBeenCalled();
  });

  it('übergeht ohne user_content ein ausgewähltes eigenes Notebook', async () => {
    const { run, helper } = makeCtx({
      agentNotebookIds: ['hamburg-notebook'],
      notebookIds: ['6f1c2e9a-0000-4000-8000-000000000001'],
      systemOnly: true,
    });
    expect((await run({ action: 'list' })).collection).toBe('hamburg');
    expect(helper.getNotebookCollection).not.toHaveBeenCalled();
  });
});

describe('boundSystemNotebook', () => {
  const state = (agentConfig: Record<string, unknown>, userLocale = 'de-DE') =>
    ({ agentConfig, userLocale }) as unknown as ChatGraphState;

  it('nennt den Sammlungsschlüssel des gebundenen Notebooks', () => {
    expect(boundSystemNotebook(state({ defaultNotebookIds: ['hamburg-notebook'] }))).toBe(
      'hamburg'
    );
  });

  it('ist null ohne gebundenes Notebook, bei einem eigenen und außerhalb der Locale', () => {
    expect(boundSystemNotebook(state({}))).toBeNull();
    expect(
      boundSystemNotebook(state({ defaultNotebookIds: ['6f1c2e9a-0000-4000-8000-000000000001'] }))
    ).toBeNull();
    expect(
      boundSystemNotebook(state({ defaultNotebookIds: ['hamburg-notebook'] }, 'de-AT'))
    ).toBeNull();
  });
});

describe('Präzisionsmodus: Scope-Sperre über normalisierte Schlüssel', () => {
  it('matches a key against the page slug and refuses another Landesverband', async () => {
    const lock = { ids: ['saarland-notebook'], readOnly: true };
    const { run, system } = makeCtx({ notebookIds: ['saarland-notebook'], scopeLock: lock });
    expect((await run({ action: 'list', notebookId: 'saarland' })).collection).toBe('saarland');
    expect((await run({ action: 'list', notebookId: 'saarland-system' })).collection).toBe(
      'saarland'
    );
    const calls = system.scrollPage.mock.calls.length;
    expect((await run({ action: 'list', notebookId: 'berlin' })).error).toMatch(/Präzisionsmodus/);
    expect(system.scrollPage.mock.calls.length).toBe(calls);
  });
});

describe('list', () => {
  it('lists sources by date with clickable URLs as ref', async () => {
    const { run, registered } = makeCtx();
    const out = await run({ action: 'list', notebookId: 'saarland' });
    expect(out).toMatchObject({ notebook: 'Grüne Saarland', total: 2, exhaustive: true });
    expect(out.results.map((r: any) => [r.title, r.url, r.ref])).toEqual([
      ['Hafen', SL_B, SL_B],
      ['Radverkehr', SL_A, SL_A],
    ]);
    expect(registered.map((r) => r.url)).toEqual([SL_B, SL_A]);
    expect(out.hint).toBeUndefined();
  });

  it('grounds rows under the same source key as grep/find passages (#3626)', async () => {
    const { run, registered } = makeCtx();
    await run({ action: 'list', notebookId: 'saarland' });
    expect(registered.map((r) => [r.documentId, r.collectionId, r.source])).toEqual([
      [SL_B, 'saarland', 'notebook'],
      [SL_A, 'saarland', 'notebook'],
    ]);
  });

  it('tells the planner to filter by category when only a page was shown (#3627)', async () => {
    const { run } = makeCtx();
    const page = await run({ action: 'list', notebookId: 'saarland', limit: 1 });
    expect(page.hint).toMatch(/filter\.category/);
    const filtered = await run({
      action: 'list',
      notebookId: 'saarland',
      limit: 1,
      filter: { category: 'beschluss' },
    });
    expect(filtered.hint).toBeUndefined();
  });

  // Live 28.09.2026: „pressemitteilung" gegen gespeichertes `presse` gab still total 0,
  // und die Antwort behauptete, MV habe nur eine Pressemitteilung.
  const categorized = () => [
    ...fakeDoc(LV, 'https://gruene-saar.de/pm', ['Pressetext.'], {
      landesverband: 'SL',
      title: 'PM',
      primary_category: 'presse',
    }),
    ...fakeDoc(LV, 'https://gruene-saar.de/lmv', ['Beschlusstext.'], {
      landesverband: 'SL',
      title: 'LMV',
      primary_category: 'beschluss',
    }),
  ];

  it('maps a guessed category to the stored value and says so', async () => {
    const { run } = makeCtx({ more: categorized() });
    const out = await run({
      action: 'list',
      notebookId: 'saarland',
      filter: { category: 'Pressemitteilungen' },
    });
    expect(out).toMatchObject({ total: 1, categoryResolved: 'Pressemitteilungen → presse' });
    const plural = await run({
      action: 'list',
      notebookId: 'saarland',
      filter: { category: 'Beschlüsse' },
    });
    expect(plural.total).toBe(1);
    const exact = await run({
      action: 'list',
      notebookId: 'saarland',
      filter: { category: 'Presse' },
    });
    expect(exact.categoryResolved).toBeUndefined();
  });

  it('refuses an unknown category with the stored values instead of an empty list', async () => {
    const { run } = makeCtx({ more: categorized() });
    for (const action of ['list', 'find', 'grep']) {
      const out = await run({
        action,
        notebookId: 'saarland',
        query: 'Hafen',
        phrase: 'Hafen',
        filter: { category: 'Wahlprogramm' },
      });
      expect(out.error).toMatch(/„Wahlprogramm" gibt es in Grüne Saarland nicht/);
      expect(out.error).toMatch(/presse \(1\), beschluss \(1\)/);
    }
    const bare = await makeCtx().run({
      action: 'list',
      notebookId: 'saarland',
      filter: { category: 'presse' },
    });
    expect(bare.error).toMatch(/keine Kategorie/);
  });

  it('ignores a stray category where sourceId makes the filter moot', async () => {
    const { run } = makeCtx({ more: categorized() });
    const filter = { category: 'Wahlprogramm' };
    const read = await run({
      action: 'read',
      notebookId: 'saarland',
      sourceId: SL_A,
      seite: 2,
      filter,
    });
    expect(read.error).toBeUndefined();
    const grep = await run({
      action: 'grep',
      notebookId: 'saarland',
      sourceId: SL_A,
      phrase: 'Wärmepumpe',
      filter,
    });
    expect(grep.error).toBeUndefined();
  });
});

describe('outline and read', () => {
  it('outlines by page and reads one page, grounded with the URL', async () => {
    const { run, registered } = makeCtx();
    const outline = await run({ action: 'outline', notebookId: 'saarland', sourceId: SL_A });
    expect(outline.outline.map((e: any) => e.heading)).toEqual(['Seite 1', 'Seite 2']);

    const out = await run({ action: 'read', notebookId: 'saarland', sourceId: SL_A, seite: 2 });
    expect(out.text).toBe('Die Wärmepumpe kommt. Wärmepumpe überall.');
    expect(out.origin).toBe('chunks');
    expect(registered.at(-1)).toMatchObject({
      source: 'notebook',
      url: SL_A,
      documentId: SL_A,
      collectionId: 'saarland',
      pageNumber: 2,
    });
  });

  it('read without sourceId points to list with offset, not to a missing source', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'read', notebookId: 'saarland' });
    expect(out.error).toMatch(/list mit sortBy date/);
  });

  it('refuses a URL from another Landesverband', async () => {
    const { run, system } = makeCtx();
    const out = await run({ action: 'read', notebookId: 'saarland', sourceId: BE_A });
    expect(out.error).toMatch(/^Quelle nicht in diesem System-Notebook/);
    expect(system.getDocumentChunks).not.toHaveBeenCalled();
  });

  it('reports a Qdrant failure with the fixed text, not as "not found"', async () => {
    const { run, system } = makeCtx();
    system.getSystemDocumentFullTextByUrl.mockRejectedValueOnce(new Error('ECONNRESET'));
    const out = await run({ action: 'read', notebookId: 'saarland', sourceId: SL_A });
    expect(out).toEqual({
      error: 'Die Quelle ließ sich gerade nicht lesen — bitte später erneut versuchen.',
    });
  });
});

describe('find', () => {
  const hit = fakeSearchDoc(SL_A, 'Radverkehr', 0.7, [
    { chunk_index: 1, text: 'Die Wärmepumpe kommt.', page_number: 2, char_start: 23, char_end: 44 },
  ]);

  it('returns passages scoped to one URL, grounded with the URL', async () => {
    const { run, registered, system } = makeCtx({ searchResults: [hit] });
    const out = await run({
      action: 'find',
      notebookId: 'saarland',
      sourceId: SL_A,
      query: 'Wärmepumpe',
    });
    expect(out.passages).toEqual([
      expect.objectContaining({ sourceId: SL_A, url: SL_A, pageNumber: 2, charStart: 23 }),
    ]);
    expect(registered[0]).toMatchObject({ url: SL_A, collectionId: 'saarland', pageNumber: 2 });
    const call = (system.search.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(call.options.additionalFilter.must[0]).toEqual({
      key: 'source_url',
      match: { value: SL_A },
    });
  });

  it('refuses a sourceId from another collection', async () => {
    const { run, system } = makeCtx({ searchResults: [hit] });
    const out = await run({ action: 'find', notebookId: 'saarland', sourceId: BE_A, query: 'x' });
    expect(out.error).toMatch(/^Quelle nicht in diesem System-Notebook/);
    expect(system.search).not.toHaveBeenCalled();
  });
});

describe('grep, stats, rank, cite', () => {
  it('counts a phrase across the collection, never outside it', async () => {
    const { run, registered } = makeCtx();
    const out = await run({ action: 'grep', notebookId: 'saarland', phrase: 'Wärmepumpe' });
    expect(out).toMatchObject({ exhaustive: true, totalHits: 2, sourcesScanned: 2 });
    expect(out.perSource).toEqual([expect.objectContaining({ sourceId: SL_A, url: SL_A })]);
    expect(registered[0]).toMatchObject({ url: SL_A, collectionId: 'saarland' });
  });

  it('counts words and pages of one source', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'stats', notebookId: 'saarland', sourceId: SL_A });
    expect(out.scope).toBe('source');
    expect(out.exhaustive).toBe(true);
    expect(out.totals).toMatchObject({ words: 8, pages: 2, chunks: 2 });
  });

  it('ranks by date, by term and by length', async () => {
    const { run } = makeCtx();
    const byDate = await run({ action: 'rank', notebookId: 'saarland', by: 'date' });
    expect(byDate.ranking.map((r: any) => r.sourceId)).toEqual([SL_B, SL_A]);
    expect(byDate.exhaustive).toBe(true);
    const byTerm = await run({
      action: 'rank',
      notebookId: 'saarland',
      by: 'term',
      query: 'Klima',
    });
    expect(byTerm.ranking).toEqual([
      { rank: 1, sourceId: SL_B, title: 'Hafen', value: 1, unit: 'Treffer' },
    ]);
    const byLength = await run({ action: 'rank', notebookId: 'saarland', by: 'length' });
    expect(byLength.ranking.map((r: any) => r.sourceId)).toEqual([SL_A, SL_B]);
  });

  it('finds a quote with its URL and page', async () => {
    const { run, registered } = makeCtx();
    const out = await run({
      action: 'cite',
      notebookId: 'saarland',
      zitat: 'Die Wärmepumpe kommt.',
    });
    expect(out).toMatchObject({ found: true, sourceId: SL_A, url: SL_A, pageNumber: 2 });
    expect(registered.at(-1)).toMatchObject({ url: SL_A, citedText: 'Die Wärmepumpe kommt.' });
  });

  it('does not find a quote that lives in another Landesverband', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'cite', notebookId: 'saarland', zitat: 'Berlin Wärmepumpe.' });
    expect(out).toMatchObject({ found: false, exhaustive: true, candidates: [] });
  });
});

// Befunde vom Testserver, 23.09.2026 — das Berlin-Notebook mit ~1.500 Quellen.
// Dieselben Fragen gegen die echte Qdrant: `notebookSourceTools.live.vitest.ts`.
describe('live findings 23.09.2026', () => {
  const step = (args: Record<string, unknown>, ok?: false): PersistedStep => ({
    toolCallId: `c${Math.random()}`,
    toolName: 'notebook_quellen',
    args,
    result: {},
    ...(ok === false ? { ok } : {}),
  });

  it('moves filter fields set one level too high into filter, and list query into titleContains', () => {
    expect(normalizeArgs({ action: 'list', titleContains: 'Hafen' })).toMatchObject({
      filter: { titleContains: 'Hafen' },
    });
    expect(normalizeArgs({ action: 'list', query: 'Hafen' })).toMatchObject({
      filter: { titleContains: 'Hafen' },
    });
    expect(
      normalizeArgs({ action: 'list', dateFrom: '2026-01-01', filter: { dateFrom: '2025-01-01' } })
    ).toMatchObject({ filter: { dateFrom: '2025-01-01' } });
    const find = { action: 'find', query: 'Hafen' };
    expect(normalizeArgs(find)).toBe(find);
  });

  // Testserver 23.09.2026: der Planer gab das Suchwort als `query` und bekam
  // „grep braucht phrase" — ein Fehlversuch pro Zählfrage.
  it('takes query as the phrase for grep', async () => {
    expect(normalizeArgs({ action: 'grep', query: 'Hafen' })).toMatchObject({ phrase: 'Hafen' });
    expect(normalizeArgs({ action: 'grep', query: 'Hafen', phrase: 'Klima' })).toMatchObject({
      phrase: 'Klima',
    });
    const { run } = makeCtx();
    const out = await run({ action: 'grep', notebookId: 'saarland', query: 'Wärmepumpe' });
    expect(out).toMatchObject({ phrase: 'Wärmepumpe', totalHits: 2 });
  });

  // Testserver 23.09.2026: „Klimaschutz" im Berlin-Notebook — 203 Quellen mit
  // Treffern, alle als Quelle registriert, 166k Zeichen im gespeicherten Ergebnis.
  it('grep shows and grounds only the sources with the most hits, but counts all', async () => {
    const { run, registered } = makeCtx({ extraPoints: true });
    const out = await run({ action: 'grep', notebookId: 'saarland', phrase: 'Hafen', limit: 1 });
    expect(out).toMatchObject({ totalHits: 2, sourcesWithHits: 2 });
    expect(out.perSource).toHaveLength(1);
    expect(registered).toHaveLength(1);
  });

  it('list filters a flat titleContains and says which filter it applied', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'list', notebookId: 'saarland', titleContains: 'hafen' });
    expect(out.results.map((r: ToolResult) => r.ref)).toEqual([SL_B]);
    expect(out.filter).toEqual({ titleContains: 'hafen' });
  });

  it('falls back to the notebook of the last successful call in the thread', async () => {
    const { run } = makeCtx({
      recentSteps: [step({ notebookId: 'saarland' }), step({ notebookId: 'berlin' }, false)],
    });
    const out = await run({ action: 'list' });
    expect(out.collection).toBe('saarland');
    expect(out.notebookFrom).toMatch(/Saarland|saarland/);
  });

  // Beta 27.09.2026: der gepinnte erste Aufruf kommt oft OHNE notebookId (das
  // Werkzeug nimmt das gewählte Notebook). Aus den Argumenten allein erinnerte
  // der Thread dann ein älteres Notebook — hier Berlin statt Saarland.
  it('remembers the notebook a call resolved without notebookId, not an older one', async () => {
    const { run } = makeCtx({ notebookIds: ['saarland-notebook'] });
    const args = { action: 'list' };
    const out = await run(args);
    expect(out.collection).toBe('saarland');
    const persisted: PersistedStep = {
      toolCallId: 'c2',
      toolName: 'notebook_quellen',
      args,
      result: out,
    };
    expect(notebookIdFromSteps([step({ notebookId: 'berlin' }), persisted])).toBe('saarland');
    expect(notebookIdFromSteps([persisted])).toBe('saarland');
  });

  it('never falls back for write actions', async () => {
    const { run } = makeCtx({ recentSteps: [step({ notebookId: 'saarland' })] });
    const out = await run({ action: 'rename', sourceId: SL_A, title: 'Neu' });
    expect(out.error).toMatch(/notebookId/);
  });

  it('keeps "no notebook" when the thread has none', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'list' })).error).toMatch(/notebookId/);
  });

  it('answers a guessed URL with the sources it may have meant', async () => {
    const { run } = makeCtx();
    const out = await run({
      action: 'read',
      notebookId: 'saarland',
      sourceId: 'https://gruene-saar.de/hafen-2026',
    });
    expect(out.error).toMatch(/Meintest du/);
    expect(out.suggestions).toEqual([{ title: 'Hafen', ref: SL_B, date: '2026-01-15' }]);
  });

  it('tells the model to search instead of guess when nothing resembles the id', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'read', notebookId: 'saarland', sourceId: 'Wahlprogramm' });
    expect(out.error).toMatch(/list \(filter.titleContains\) oder find/);
    expect(out.suggestions).toBeUndefined();
  });

  it('scopes find and rank by date to the URLs inside the range, before the limit', async () => {
    const { run, system } = makeCtx({
      searchResults: [fakeSearchDoc(SL_A, 'Radverkehr', 0.9, [{ chunk_index: 0, text: 'x' }])],
    });
    const filter = { dateFrom: '2025-01-01', dateTo: '2025-12-31' };
    const found = await run({ action: 'find', notebookId: 'saarland', query: 'Rad', filter });
    expect(found.filter).toEqual(filter);
    await run({ action: 'rank', notebookId: 'saarland', by: 'relevance', query: 'Rad', filter });
    for (const call of system.search.mock.calls as unknown as Array<[Record<string, any>]>) {
      expect(call[0].options.additionalFilter.must).toContainEqual({
        key: 'source_url',
        match: { any: [SL_A] },
      });
    }
  });

  it('says so when no source matches the filter, without searching', async () => {
    const { run, system } = makeCtx();
    const out = await run({
      action: 'find',
      notebookId: 'saarland',
      query: 'Rad',
      filter: { dateFrom: '2030-01-01' },
    });
    expect(out.error).toMatch(/Keine Quelle passt zu filter/);
    expect(system.search).not.toHaveBeenCalled();
  });

  // Mehr als SYSTEM_SCAN_MAX_SOURCES Saarlander Quellen, eine mit zwei Schreibweisen.
  const manySaarland = (): FakePoint[] =>
    Array.from({ length: 205 }, (_, i) =>
      fakeDoc(
        LV,
        `https://gruene-saar.de/n/${i}`,
        [i === 7 ? 'Charite und Charité.' : `Text ${i}.`],
        {
          landesverband: 'SL',
          title: `Nr ${i}`,
          published_at: '2024-01-01',
        }
      )
    ).flat();

  const usedIndex = (system: ReturnType<typeof makeCtx>['system']) =>
    system.scrollPage.mock.calls.some((c) => JSON.stringify(c[1]).includes('"chunk_text"'));

  it('reads a scope of at most 200 sources whole — accents fold, no count rule needed', async () => {
    const { run, system } = makeCtx();
    const out = await run({ action: 'grep', notebookId: 'saarland', phrase: 'Warmepumpe' });
    expect(out).toMatchObject({ exhaustive: true, totalHits: 2, sourcesScanned: 2 });
    expect(out.countRule).toBeUndefined();
    expect(usedIndex(system)).toBe(false);
  });

  it('counts over the chunk_text index beyond 200 sources and says what it counted', async () => {
    const { run, system } = makeCtx({ more: manySaarland() });
    const grep = await run({ action: 'grep', notebookId: 'saarland', phrase: 'Charite' });
    expect(grep).toMatchObject({
      exhaustive: true,
      totalHits: 1,
      sourcesScanned: 207,
      sourcesWithHits: 1,
      otherSpellings: { charité: 1 },
    });
    expect(grep.countRule).toMatch(/nur Groß\/klein egal/);
    expect(grep.note).toMatch(/1× als „charité"/);
    const ranked = await run({
      action: 'rank',
      notebookId: 'saarland',
      by: 'term',
      query: 'Charite',
    });
    expect(ranked.exhaustive).toBe(true);
    expect(ranked.countRule).toMatch(/nur Groß\/klein egal/);
    expect(usedIndex(system)).toBe(true);
    expect(system.getSystemDocumentFullTextByUrl).not.toHaveBeenCalled();
  });

  it('does not claim exhaustive via the index when the collection has none', async () => {
    const { run, system } = makeCtx({ more: manySaarland(), textIndex: null });
    const grep = await run({ action: 'grep', notebookId: 'saarland', phrase: 'Charite' });
    expect(grep.exhaustive).toBe(false);
    expect(grep.countRule).toBeUndefined();
    expect(usedIndex(system)).toBe(false);
  });

  it('says how many undated sources a date filter left out', async () => {
    const { run } = makeCtx({ extraPoints: true });
    const filter = { dateFrom: '2025-01-01' };
    const listed = await run({ action: 'list', notebookId: 'saarland', filter });
    expect(listed.undatedExcluded).toBe(1);
    expect(listed.note).toMatch(/1 Quelle ohne Datum fehlt/);
    const grep = await run({ action: 'grep', notebookId: 'saarland', phrase: 'Hafen', filter });
    expect(grep.undatedExcluded).toBe(1);
    const unfiltered = await run({ action: 'list', notebookId: 'saarland' });
    expect(unfiltered.undatedExcluded).toBeUndefined();
    expect(unfiltered.note).toBeUndefined();
  });

  it('list and rank carry one line per source for later turns (refs)', async () => {
    const { run } = makeCtx();
    const listed = await run({ action: 'list', notebookId: 'saarland' });
    expect(listed.refs).toBe(`Hafen — ${SL_B} (2026-01-15)\nRadverkehr — ${SL_A} (2025-03-01)`);
    const ranked = await run({
      action: 'rank',
      notebookId: 'saarland',
      by: 'term',
      query: 'Klima',
    });
    expect(ranked.refs).toBe(`1. Hafen — ${SL_B} (1 Treffer)`);
  });

  it('a 20-row list keeps every ref in the replay of a later turn (#3561)', async () => {
    const berlin: FakePoint[] = Array.from({ length: 20 }, (_, i) =>
      fakeDoc(
        LV,
        `https://gruene-fraktion.berlin/pressemitteilungen/kuerzungen-im-haushalt-2026-teil-${i}/`,
        ['Text.'],
        {
          landesverband: 'BE',
          title: `Kürzungen im Haushalt 2026 treffen Klimaschutz und Verkehrswende, Teil ${i}`,
          published_at: `2026-0${1 + (i % 9)}-1${i % 10}T09:49:15+01:00`,
          content_type: 'presse',
        }
      )
    ).flat();
    const { deps } = makeCtx();
    const system = makeSystemDeps(berlin);
    const tool = makeNotebookSourcesTool({
      state: {
        agentConfig: { userId: 'user-1' },
        userLocale: 'de-DE',
        messages: [],
        notebookIds: [],
      } as unknown as ChatGraphState,
      sse: { send: () => {} } as unknown as SSEWriter,
      threadId: 't1',
      sourceRegistry: { note: () => {}, register: () => '' } as unknown as SourceRegistry,
      deps: { ...deps, scrollPage: system.scrollPage } as NotebookSourceToolDeps &
        NotebookSourceWriteDeps,
    });
    const args = { action: 'list', notebookId: 'berlin', limit: 20, mode: 'hybrid', rerank: false };
    const result = (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      args,
      {}
    ))!;
    expect(result.results).toHaveLength(20);
    // Das ganze Ergebnis sprengt jede Vorschau — deshalb die kompakten refs.
    expect(JSON.stringify(result).length).toBeGreaterThan(6000);

    const replay = buildToolObservationReplay(
      [{ toolCallId: 'c1', toolName: 'notebook_quellen', args, result }],
      new Set(['notebook_quellen'])
    );
    const value = (replay[1]!.content as Array<{ output: { value: string } }>)[0]!.output.value;
    expect(value.length).toBeLessThanOrEqual(4001);
    for (const row of result.results as ToolResult[]) expect(value).toContain(row.ref);
  });

  it('grep over a narrow filter reads only those sources', async () => {
    const { run } = makeCtx();
    const out = await run({
      action: 'grep',
      notebookId: 'saarland',
      phrase: 'Wärmepumpe',
      filter: { dateTo: '2025-12-31' },
    });
    expect(out.sourcesScanned).toBe(1);
    expect(out.totalHits).toBe(2);
    expect(out.exhaustive).toBe(true);
  });
});

// Testserver 24.09.2026: „Welche Kategorien gibt es?" → „keine Kategorien". Der
// Schreiber im split-Modus sieht keine Werkzeug-Rückgaben, nur Quellen und
// Notizen — Kennzahlen, die nur im Rückgabewert stehen, erreichen ihn nie.
describe('what the writer sees in split mode', () => {
  it('list leaves a note with total, exhaustive and the categories', async () => {
    const { run, notes } = makeCtx();
    const out = await run({ action: 'list', notebookId: 'saarland' });
    const [title, content] = notes.at(-1) ?? ['', ''];
    expect(title).toContain('list');
    expect(content).toContain('total: 2');
    expect(content).toContain('exhaustive: ja');
    for (const [category, count] of Object.entries(out.categories as Record<string, number>)) {
      expect(content).toContain(`${category} ${count}`);
    }
  });

  it('grep leaves a note with the totals, not only the per-source rows', async () => {
    const { run, notes } = makeCtx();
    await run({ action: 'grep', notebookId: 'saarland', phrase: 'Wärmepumpe' });
    const [, content] = notes.at(-1) ?? ['', ''];
    expect(content).toContain('totalHits: 2');
    expect(content).toContain('sourcesScanned: 2');
    expect(content).toContain('exhaustive: ja');
  });

  it('rank leaves a note with the criterion and the filter', async () => {
    const { run, notes } = makeCtx();
    await run({
      action: 'rank',
      notebookId: 'saarland',
      by: 'date',
      filter: { dateFrom: '2020-01-01' },
    });
    const [, content] = notes.at(-1) ?? ['', ''];
    expect(content).toContain('by: date');
    expect(content).toContain('dateFrom=2020-01-01');
  });

  it('find and read leave no summary note — their sources carry the content', async () => {
    const { run, notes } = makeCtx();
    await run({ action: 'read', notebookId: 'saarland', sourceId: SL_A });
    expect(notes).toEqual([]);
  });
});

describe('notebookForPrompt', () => {
  it('names a system notebook by collection key or slug', () => {
    expect(notebookForPrompt('saarland', 'de-DE')).toEqual({
      id: 'saarland',
      name: 'Grüne Saarland',
    });
    expect(notebookForPrompt('saarland-notebook', 'de-DE')?.name).toBe('Grüne Saarland');
  });

  it('keeps an own notebook as an id without a name', () => {
    expect(notebookForPrompt('3f1c2b4e-0000-4000-8000-000000000001', 'de-DE')).toEqual({
      id: '3f1c2b4e-0000-4000-8000-000000000001',
      name: null,
    });
  });

  it('is null without an id or for a system notebook this locale cannot read', () => {
    expect(notebookForPrompt(null, 'de-DE')).toBeNull();
    expect(notebookForPrompt('saarland', 'de-AT')).toBeNull();
  });
});

describe('Wolke sources (stored as wolke://)', () => {
  const SL_W = 'wolke://hh-share/Ordner/Grüne Antwort.pdf';
  const wolkeDoc = () =>
    fakeDoc(LV, SL_W, ['Wolke Wärmepumpe.'], {
      landesverband: 'SL',
      title: 'Grüne Antwort',
      published_at: '2026-02-01',
    });

  it('grounds a read with the resolved link and keeps the stored key as documentId', async () => {
    const { run, registered } = makeCtx({ more: wolkeDoc() });
    const out = await run({ action: 'read', notebookId: 'saarland', sourceId: SL_W });
    expect(out.source).toMatchObject({ id: SL_W });
    expect(registered.at(-1)).toMatchObject({
      url: `${WOLKE_LINK}Ordner/Grüne Antwort.pdf`,
      documentId: SL_W,
    });
  });

  it('find hands back the stored key when search shows the resolved link', async () => {
    const hit = fakeSearchDoc(`${WOLKE_LINK}Ordner/Grüne Antwort.pdf`, 'Grüne Antwort', 0.7, [
      { chunk_index: 0, text: 'Wolke Wärmepumpe.' },
    ]);
    const { run, registered } = makeCtx({ more: wolkeDoc(), searchResults: [hit] });
    const out = await run({ action: 'find', notebookId: 'saarland', query: 'Wärmepumpe' });
    expect(out.passages[0]).toMatchObject({ sourceId: SL_W });
    expect(registered[0]).toMatchObject({
      url: `${WOLKE_LINK}Ordner/Grüne Antwort.pdf`,
      documentId: SL_W,
    });
  });

  it('rank by relevance names the stored key, not the resolved link', async () => {
    const hit = fakeSearchDoc(`${WOLKE_LINK}Ordner/Grüne Antwort.pdf`, 'Grüne Antwort', 0.7, [
      { chunk_index: 0, text: 'Wolke Wärmepumpe.' },
    ]);
    const { run } = makeCtx({ more: wolkeDoc(), searchResults: [hit] });
    const out = await run({
      action: 'rank',
      notebookId: 'saarland',
      by: 'relevance',
      query: 'Wärmepumpe',
    });
    expect(out.ranking.map((r: any) => r.sourceId)).toEqual([SL_W]);
  });

  it('grounds stats of one Wolke source like read: resolved url, stored documentId', async () => {
    const { run, registered } = makeCtx({ more: wolkeDoc() });
    await run({ action: 'stats', notebookId: 'saarland', sourceId: SL_W });
    expect(registered.at(-1)).toMatchObject({
      url: `${WOLKE_LINK}Ordner/Grüne Antwort.pdf`,
      documentId: SL_W,
    });
  });
});
