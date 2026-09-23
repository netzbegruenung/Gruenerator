/**
 * `notebook_quellen` auf System-Notebooks — jede Aktion gegen den Qdrant-Fake
 * aus `fakeSystemCollection.ts`. Die Landesverbände Hamburg und Berlin teilen
 * sich `landesverbaende_documents`; eine Berliner URL im Hamburg-Notebook ist
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

import { makeNotebookSourcesTool, type NotebookSourceToolDeps } from './notebookSourceTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { DocumentResult } from '../../../services/BaseSearchService/types.js';
import type { StatsNlp } from '../../../services/notebook/sourceStats.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, any>;

const LV = 'landesverbaende_documents';
const HH_A = 'https://gruene-hamburg.de/a';
const HH_B = 'https://gruene-hamburg.de/b';
const BE_A = 'https://gruene.berlin/a';
const AT_A = 'https://gruene.at/programm';

function points(): FakePoint[] {
  return [
    ...fakeDoc(
      LV,
      HH_A,
      ['Hamburg baut Radwege.', 'Die Wärmepumpe kommt. Wärmepumpe überall.'],
      { landesverband: 'HH', title: 'Radverkehr', published_at: '2025-03-01' },
      { pages: [1, 2] }
    ),
    ...fakeDoc(LV, HH_B, ['Hafen und Klima.'], {
      landesverband: 'HH',
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
    agentConfig: { userId: 'user-1' },
    userLocale: opts.locale ?? 'de-DE',
    messages: [],
    notebookIds: opts.notebookIds ?? [],
  } as unknown as ChatGraphState;
  const system = makeSystemDeps(points(), {
    ...(opts.searchResults ? { searchResults: opts.searchResults } : {}),
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
    documentService: system.deps.documentService,
    ...(opts.nlp ? { nlp: opts.nlp } : {}),
  } as unknown as NotebookSourceToolDeps;
  const tool = makeNotebookSourcesTool({
    state,
    sse: { send: () => {} } as unknown as SSEWriter,
    threadId: 't1',
    sourceRegistry,
    deps,
  });
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
    const out = await byKey.run({ action: 'list', notebookId: 'hamburg' });
    expect(out.collection).toBe('hamburg');
    expect(byKey.helper.getNotebookCollection).not.toHaveBeenCalled();

    const bySystemId = makeCtx();
    expect(
      (await bySystemId.run({ action: 'list', notebookId: 'hamburg-system' })).collection
    ).toBe('hamburg');

    const bySlug = makeCtx({ notebookIds: ['hamburg-notebook'] });
    expect((await bySlug.run({ action: 'list' })).collection).toBe('hamburg');
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
    expect((await run({ action: 'list', notebookId: 'hamburg' })).error).toMatch(
      /steht hier nicht zur Verfügung/
    );
  });

  it('prefers a selected user notebook, then a resolvable system notebook', async () => {
    const { run } = makeCtx({ notebookIds: ['gruenerator-notebook', 'hamburg-notebook'] });
    expect((await run({ action: 'list' })).collection).toBe('hamburg');
  });

  it('asks for one key when a slug covers several collections', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'list', notebookId: 'gruenerator-notebook' })).error).toMatch(
      /mehrere Sammlungen/
    );
  });

  it('refuses write actions on a system notebook, as source and as move target', async () => {
    const byKey = makeCtx();
    expect(await byKey.run({ action: 'remove', notebookId: 'hamburg', sourceIds: [HH_A] })).toEqual(
      { error: SYSTEM_READ_ONLY }
    );
    expect(byKey.system.scrollPage).not.toHaveBeenCalled();

    const bySelection = makeCtx({ notebookIds: ['hamburg-notebook'] });
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
        targetNotebookId: 'hamburg',
      })
    ).toEqual({ error: SYSTEM_READ_ONLY });
    expect(intoSystem.helper.getCollectionDocuments).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('lists sources by date with clickable URLs as ref', async () => {
    const { run, registered } = makeCtx();
    const out = await run({ action: 'list', notebookId: 'hamburg' });
    expect(out).toMatchObject({ notebook: 'Grüne Hamburg', total: 2, exhaustive: true });
    expect(out.results.map((r: any) => [r.title, r.url, r.ref])).toEqual([
      ['Hafen', HH_B, HH_B],
      ['Radverkehr', HH_A, HH_A],
    ]);
    expect(registered.map((r) => r.url)).toEqual([HH_B, HH_A]);
  });
});

describe('outline and read', () => {
  it('outlines by page and reads one page, grounded with the URL', async () => {
    const { run, registered } = makeCtx();
    const outline = await run({ action: 'outline', notebookId: 'hamburg', sourceId: HH_A });
    expect(outline.outline.map((e: any) => e.heading)).toEqual(['Seite 1', 'Seite 2']);

    const out = await run({ action: 'read', notebookId: 'hamburg', sourceId: HH_A, seite: 2 });
    expect(out.text).toBe('Die Wärmepumpe kommt. Wärmepumpe überall.');
    expect(out.origin).toBe('chunks');
    expect(registered.at(-1)).toMatchObject({
      source: 'notebook',
      url: HH_A,
      documentId: HH_A,
      collectionId: 'hamburg',
      pageNumber: 2,
    });
  });

  it('refuses a URL from another Landesverband', async () => {
    const { run, system } = makeCtx();
    const out = await run({ action: 'read', notebookId: 'hamburg', sourceId: BE_A });
    expect(out.error).toMatch(/^Quelle nicht in diesem System-Notebook/);
    expect(system.getDocumentChunks).not.toHaveBeenCalled();
  });

  it('reports a Qdrant failure with the fixed text, not as "not found"', async () => {
    const { run, system } = makeCtx();
    system.getSystemDocumentFullTextByUrl.mockRejectedValueOnce(new Error('ECONNRESET'));
    const out = await run({ action: 'read', notebookId: 'hamburg', sourceId: HH_A });
    expect(out).toEqual({
      error: 'Die Quelle ließ sich gerade nicht lesen — bitte später erneut versuchen.',
    });
  });
});

describe('find', () => {
  const hit = fakeSearchDoc(HH_A, 'Radverkehr', 0.7, [
    { chunk_index: 1, text: 'Die Wärmepumpe kommt.', page_number: 2, char_start: 23, char_end: 44 },
  ]);

  it('returns passages scoped to one URL, grounded with the URL', async () => {
    const { run, registered, system } = makeCtx({ searchResults: [hit] });
    const out = await run({
      action: 'find',
      notebookId: 'hamburg',
      sourceId: HH_A,
      query: 'Wärmepumpe',
    });
    expect(out.passages).toEqual([
      expect.objectContaining({ sourceId: HH_A, url: HH_A, pageNumber: 2, charStart: 23 }),
    ]);
    expect(registered[0]).toMatchObject({ url: HH_A, collectionId: 'hamburg', pageNumber: 2 });
    const call = (system.search.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(call.options.additionalFilter.must[0]).toEqual({
      key: 'source_url',
      match: { value: HH_A },
    });
  });

  it('refuses a sourceId from another collection', async () => {
    const { run, system } = makeCtx({ searchResults: [hit] });
    const out = await run({ action: 'find', notebookId: 'hamburg', sourceId: BE_A, query: 'x' });
    expect(out.error).toMatch(/^Quelle nicht in diesem System-Notebook/);
    expect(system.search).not.toHaveBeenCalled();
  });
});

describe('grep, stats, rank, cite', () => {
  it('counts a phrase across the collection, never outside it', async () => {
    const { run, registered } = makeCtx();
    const out = await run({ action: 'grep', notebookId: 'hamburg', phrase: 'Wärmepumpe' });
    expect(out).toMatchObject({ exhaustive: true, totalHits: 2, sourcesScanned: 2 });
    expect(out.perSource).toEqual([expect.objectContaining({ sourceId: HH_A, url: HH_A })]);
    expect(registered[0]).toMatchObject({ url: HH_A, collectionId: 'hamburg' });
  });

  it('counts words and pages of one source', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'stats', notebookId: 'hamburg', sourceId: HH_A });
    expect(out.scope).toBe('source');
    expect(out.exhaustive).toBe(true);
    expect(out.totals).toMatchObject({ words: 8, pages: 2, chunks: 2 });
  });

  it('ranks by date, by term and by length', async () => {
    const { run } = makeCtx();
    const byDate = await run({ action: 'rank', notebookId: 'hamburg', by: 'date' });
    expect(byDate.ranking.map((r: any) => r.sourceId)).toEqual([HH_B, HH_A]);
    expect(byDate.exhaustive).toBe(true);
    const byTerm = await run({ action: 'rank', notebookId: 'hamburg', by: 'term', query: 'Klima' });
    expect(byTerm.ranking).toEqual([
      { rank: 1, sourceId: HH_B, title: 'Hafen', value: 1, unit: 'Treffer' },
    ]);
    const byLength = await run({ action: 'rank', notebookId: 'hamburg', by: 'length' });
    expect(byLength.ranking.map((r: any) => r.sourceId)).toEqual([HH_A, HH_B]);
  });

  it('finds a quote with its URL and page', async () => {
    const { run, registered } = makeCtx();
    const out = await run({
      action: 'cite',
      notebookId: 'hamburg',
      zitat: 'Die Wärmepumpe kommt.',
    });
    expect(out).toMatchObject({ found: true, sourceId: HH_A, url: HH_A, pageNumber: 2 });
    expect(registered.at(-1)).toMatchObject({ url: HH_A, citedText: 'Die Wärmepumpe kommt.' });
  });

  it('does not find a quote that lives in another Landesverband', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'cite', notebookId: 'hamburg', zitat: 'Berlin Wärmepumpe.' });
    expect(out).toMatchObject({ found: false, exhaustive: true, candidates: [] });
  });
});
