/**
 * `systemNotebookSources` gegen einen Qdrant-Fake (`fakeSystemCollection.ts`)
 * — kein Qdrant. Die Landesverbände teilen sich `landesverbaende_documents`;
 * daran hängt die Zugehörigkeitsregel.
 */
import { describe, expect, it } from 'vitest';

import {
  fakeDoc,
  fakeSearchDoc,
  makeSystemDeps,
  type FakePoint,
} from './__fixtures__/fakeSystemCollection.js';
import {
  findSystemPassages,
  listSystemSources,
  loadSystemScanTexts,
  outlineSystemSource,
  readSystemSourceText,
  resolveSystemCollection,
  SYSTEM_LIST_SCROLL_MAX,
  SYSTEM_SCAN_MAX_SOURCES,
  type SystemCollection,
} from './systemNotebookSources.js';

const DE_KEYS = ['deutschland', 'bundestagsfraktion', 'hamburg', 'berlin'];

function resolved(id: string, allowed: readonly string[] = DE_KEYS): SystemCollection {
  const r = resolveSystemCollection(id, allowed);
  if (!r || 'error' in r) throw new Error(`not resolved: ${JSON.stringify(r)}`);
  return r.collection;
}

const LV = 'landesverbaende_documents';
const HH_A = 'https://gruene-hamburg.de/a';
const HH_B = 'https://gruene-hamburg.de/b';
const BE_A = 'https://gruene.berlin/a';

function lvPoints(): FakePoint[] {
  return [
    ...fakeDoc(
      LV,
      HH_A,
      ['Hamburg Radverkehr.', 'Wärmepumpe im Quartier.'],
      {
        landesverband: 'HH',
        title: 'Radverkehr',
        published_at: '2025-03-01',
        primary_category: 'Beschluss',
      },
      { pages: [1, 2] }
    ),
    ...fakeDoc(LV, HH_B, ['Hafen und Klima.'], {
      landesverband: 'HH',
      title: 'Hafen',
      published_at: '2026-01-15',
      primary_category: 'Pressemitteilung',
    }),
    ...fakeDoc(LV, BE_A, ['Berlin Mietendeckel.'], {
      landesverband: 'BE',
      title: 'Mieten',
      published_at: '2026-05-01',
    }),
  ];
}

describe('resolveSystemCollection', () => {
  it('accepts a collection key, a system id and a notebook slug', () => {
    expect(resolved('deutschland')).toMatchObject({
      key: 'deutschland',
      systemId: 'grundsatz-system',
      qdrantCollection: 'grundsatz_documents',
    });
    expect(resolved('grundsatz-system').key).toBe('deutschland');
    expect(resolved('hamburg-notebook').key).toBe('hamburg');
  });

  it('returns null for ids that are no system collection', () => {
    expect(resolveSystemCollection('0b8e6a3c-1d2e-4f00-9abc-123456789abc', DE_KEYS)).toBeNull();
  });

  it('refuses a key outside the allowed (locale) set', () => {
    const r = resolveSystemCollection('oesterreich', DE_KEYS);
    expect(r).toEqual({
      error:
        'Das System-Notebook „oesterreich" steht hier nicht zur Verfügung — verfügbar sind: deutschland, bundestagsfraktion, hamburg, berlin.',
    });
    // Umgekehrt: eine AT-Menge kennt die deutschen Landesverbände nicht.
    expect(resolveSystemCollection('hamburg', ['oesterreich'])).toHaveProperty('error');
    expect(resolved('oesterreich', ['oesterreich']).qdrantCollection).toBe(
      'oesterreich_gruene_documents'
    );
  });

  it('asks for one key when a slug stands for several collections', () => {
    const r = resolveSystemCollection('gruenerator-notebook', DE_KEYS);
    expect(r).toEqual({
      error:
        'Dieses System-Notebook umfasst mehrere Sammlungen — gib notebookId als eine davon an: deutschland, bundestagsfraktion.',
    });
  });
});

describe('listSystemSources', () => {
  it('scrolls chunk-0 points under the default filter and sorts by date', async () => {
    const { deps, scrollPage } = makeSystemDeps(lvPoints());
    const out = await listSystemSources({ collection: resolved('hamburg') }, deps);
    expect(out.exhaustive).toBe(true);
    expect(out.total).toBe(2);
    expect(out.items.map((r) => r.id)).toEqual([HH_B, HH_A]);
    expect(out.items[0]).toMatchObject({
      title: 'Hafen',
      sourceUrl: HH_B,
      sourceType: 'Pressemitteilung',
      createdAt: '2026-01-15',
      words: null,
      pages: null,
    });
    const [collection, filter, opts] = scrollPage.mock.calls[0]!;
    expect(collection).toBe(LV);
    expect(filter).toEqual({
      must: [
        { key: 'chunk_index', match: { value: 0 } },
        { key: 'landesverband', match: { value: 'HH' } },
      ],
    });
    // Nie den Volltext mitschleppen: 5000 Punkte × full_text wären Hunderte MB.
    expect(opts.payload).not.toContain('full_text');
    expect(opts.payload).not.toContain('chunk_text');
  });

  it('filters by category, title and date range, and sorts by name', async () => {
    const { deps } = makeSystemDeps(lvPoints());
    const c = resolved('hamburg');
    const byCat = await listSystemSources(
      { collection: c, filter: { category: 'beschluss' } },
      deps
    );
    expect(byCat.items.map((r) => r.id)).toEqual([HH_A]);
    const byTitle = await listSystemSources(
      { collection: c, filter: { titleContains: 'haf' } },
      deps
    );
    expect(byTitle.items.map((r) => r.id)).toEqual([HH_B]);
    const byDate = await listSystemSources(
      { collection: c, filter: { dateFrom: '2026-01-01', dateTo: '2026-12-31' } },
      deps
    );
    expect(byDate.items.map((r) => r.id)).toEqual([HH_B]);
    const byName = await listSystemSources({ collection: c, sortBy: 'name' }, deps);
    expect(byName.items.map((r) => r.title)).toEqual(['Hafen', 'Radverkehr']);
  });

  it(`never scrolls more than ${SYSTEM_LIST_SCROLL_MAX} points and flags exhaustive:false`, async () => {
    const { deps, scrollPage } = makeSystemDeps([], { endless: true });
    const out = await listSystemSources({ collection: resolved('deutschland'), limit: 5 }, deps);
    expect(out.exhaustive).toBe(false);
    expect(out.total).toBe(SYSTEM_LIST_SCROLL_MAX);
    const scrolled = scrollPage.mock.calls.reduce((s, c) => s + c[2].limit, 0);
    expect(scrolled).toBe(SYSTEM_LIST_SCROLL_MAX);
    expect(out.items).toHaveLength(5);
  });
});

describe('readSystemSourceText', () => {
  it('reads full_text from chunk 0 and maps chunks with page numbers', async () => {
    const points = fakeDoc(
      'grundsatz_documents',
      'https://gruene.de/gsp',
      ['Präambel.', 'Klima.'],
      { title: 'Grundsatzprogramm' },
      { fullText: 'Präambel.\nKlima.', pages: [1, 2] }
    );
    const { deps } = makeSystemDeps(points);
    const out = await readSystemSourceText(
      { collection: resolved('deutschland'), sourceUrl: 'https://gruene.de/gsp' },
      deps
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.origin).toBe('full_text');
    expect(out.title).toBe('Grundsatzprogramm');
    expect(out.text).toBe('Präambel.\nKlima.');
    expect(out.chunkMap).toEqual([
      { index: 0, charStart: 0, charEnd: 9, pageNumber: 1 },
      { index: 1, charStart: 10, charEnd: 16, pageNumber: 2 },
    ]);
  });

  it('joins the chunks when there is no full_text', async () => {
    const { deps } = makeSystemDeps(lvPoints());
    const out = await readSystemSourceText(
      { collection: resolved('hamburg'), sourceUrl: HH_A },
      deps
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.origin).toBe('chunks');
    expect(out.text).toBe('Hamburg Radverkehr.\n\nWärmepumpe im Quartier.');
    expect(out.chunkMap[1]).toEqual({ index: 1, charStart: 21, charEnd: 44, pageNumber: 2 });
  });

  it('refuses a URL from another collection before reading its chunks', async () => {
    const { deps, getDocumentChunks, getSystemDocumentFullTextByUrl } = makeSystemDeps(lvPoints());
    // Berlin liegt in derselben Qdrant-Sammlung — nur der Standardfilter trennt.
    const out = await readSystemSourceText(
      { collection: resolved('hamburg'), sourceUrl: BE_A },
      deps
    );
    expect(out).toEqual({
      error:
        'Quelle nicht in diesem System-Notebook — die sourceId ist die URL aus list (Feld ref).',
    });
    expect(getSystemDocumentFullTextByUrl).toHaveBeenCalledWith(LV, BE_A, {
      must: [{ key: 'landesverband', match: { value: 'HH' } }],
    });
    expect(getDocumentChunks).not.toHaveBeenCalled();
  });

  it('refuses a sourceId that is not a URL', async () => {
    const { deps, getSystemDocumentFullTextByUrl } = makeSystemDeps(lvPoints());
    const out = await readSystemSourceText(
      { collection: resolved('hamburg'), sourceUrl: 'd1' },
      deps
    );
    expect(out).toHaveProperty('error');
    expect(getSystemDocumentFullTextByUrl).not.toHaveBeenCalled();
  });

  it('throws when Qdrant fails — a failure is not "not in this notebook"', async () => {
    const { deps, getSystemDocumentFullTextByUrl } = makeSystemDeps(lvPoints());
    getSystemDocumentFullTextByUrl.mockResolvedValueOnce({
      success: false,
      fullText: '',
      chunkCount: 0,
      error: 'Qdrant not available',
    });
    await expect(
      readSystemSourceText({ collection: resolved('hamburg'), sourceUrl: HH_A }, deps)
    ).rejects.toThrow(/Qdrant not available/);
  });
});

describe('outlineSystemSource', () => {
  const chunk = (index: number, pageNumber: number | null, over = {}) => ({
    index,
    text: 'x'.repeat(10),
    tokens: 1,
    pageNumber,
    ...over,
  });

  it('uses sections when the chunks carry them', () => {
    const out = outlineSystemSource([
      chunk(0, 1, { sectionIndex: 0, headingPath: ['A'], heading: 'A' }),
      chunk(1, 2, { sectionIndex: 1, headingPath: ['B'], heading: 'B' }),
    ]);
    expect(out.map((e) => e.heading)).toEqual(['A', 'B']);
  });

  it('falls back to page groups', () => {
    const out = outlineSystemSource([chunk(0, 1), chunk(1, 1), chunk(2, 2)]);
    expect(out).toEqual([
      expect.objectContaining({ heading: 'Seite 1', chunkFrom: 0, chunkTo: 1, pageFrom: 1 }),
      expect.objectContaining({ heading: 'Seite 2', chunkFrom: 2, chunkTo: 2, pageFrom: 2 }),
    ]);
  });

  it('is empty without sections and pages', () => {
    expect(outlineSystemSource([chunk(0, null), chunk(1, null)])).toEqual([]);
  });
});

describe('findSystemPassages', () => {
  it('searches the collection with its default filter and scopes to one URL', async () => {
    const { deps, search } = makeSystemDeps([], {
      searchResults: [
        fakeSearchDoc(HH_A, 'Radverkehr', 0.8, [
          {
            chunk_index: 1,
            text: 'Wärmepumpe im Quartier.',
            page_number: 2,
            char_start: 20,
            char_end: 43,
          },
        ]),
      ],
    });
    const out = await findSystemPassages(
      {
        collection: resolved('hamburg'),
        query: 'Wärmepumpe',
        sourceUrl: HH_A,
        mode: 'hybrid',
        limit: 5,
        rerank: false,
      },
      deps
    );
    expect(out.passages).toEqual([
      {
        sourceId: HH_A,
        title: 'Radverkehr',
        chunkIndex: 1,
        pageNumber: 2,
        charStart: 20,
        charEnd: 43,
        score: 0.8,
        hasTerm: false,
        text: 'Wärmepumpe im Quartier.',
      },
    ]);
    const call = (search.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(call.userId).toBeUndefined();
    expect(call.options.searchCollection).toBe(LV);
    expect(call.options.mode).toBe('hybrid');
    expect(call.options.additionalFilter).toEqual({
      must: [
        { key: 'source_url', match: { value: HH_A } },
        { key: 'landesverband', match: { value: 'HH' } },
      ],
    });
  });

  it('searches the whole collection without a URL', async () => {
    const { deps, search } = makeSystemDeps([]);
    await findSystemPassages(
      {
        collection: resolved('deutschland'),
        query: 'Klima',
        mode: 'text',
        limit: 5,
        rerank: false,
      },
      deps
    );
    const call = (search.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(call.options.searchCollection).toBe('grundsatz_documents');
    expect(call.options.mode).toBe('text');
    expect(call.options.additionalFilter).toBeUndefined();
  });

  it('throws when the search fails', async () => {
    const { deps } = makeSystemDeps([], { searchError: 'embed down' });
    await expect(
      findSystemPassages(
        {
          collection: resolved('deutschland'),
          query: 'Klima',
          mode: 'hybrid',
          limit: 5,
          rerank: false,
        },
        deps
      )
    ).rejects.toThrow(/embed down/);
  });
});

describe('loadSystemScanTexts', () => {
  it('reads every source of a small collection', async () => {
    const { deps } = makeSystemDeps(lvPoints());
    const out = await loadSystemScanTexts({ collection: resolved('hamburg') }, deps);
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(true);
    expect(out.sources.map((s) => s.sourceId).sort()).toEqual([HH_A, HH_B]);
  });

  it('reads a single URL and refuses one from another collection', async () => {
    const { deps } = makeSystemDeps(lvPoints());
    const one = await loadSystemScanTexts(
      { collection: resolved('hamburg'), sourceUrl: HH_A },
      deps
    );
    if ('error' in one) throw new Error(one.error);
    expect(one.sources).toHaveLength(1);
    const other = await loadSystemScanTexts(
      { collection: resolved('hamburg'), sourceUrl: BE_A },
      deps
    );
    expect(other).toHaveProperty('error');
  });

  it('stops at the char budget and says so', async () => {
    const { deps } = makeSystemDeps(lvPoints());
    const out = await loadSystemScanTexts(
      { collection: resolved('hamburg'), charBudget: 10 },
      deps
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.incompleteReason).toBe('Notebook zu groß');
  });

  it(`reads only prefilter candidates beyond ${SYSTEM_SCAN_MAX_SOURCES} sources`, async () => {
    const points: FakePoint[] = [];
    for (let i = 0; i <= SYSTEM_SCAN_MAX_SOURCES; i++) {
      points.push(...fakeDoc('grundsatz_documents', `https://gruene.de/${i}`, [`Text ${i}.`]));
    }
    const { deps, search, getSystemDocumentFullTextByUrl } = makeSystemDeps(points, {
      searchResults: [
        fakeSearchDoc('https://gruene.de/7', 'Sieben', 0.5, [{ chunk_index: 0, text: 'Text 7.' }]),
      ],
    });
    const out = await loadSystemScanTexts(
      { collection: resolved('deutschland'), prefilterQuery: 'Text 7' },
      deps
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.sources.map((s) => s.sourceId)).toEqual(['https://gruene.de/7']);
    expect(getSystemDocumentFullTextByUrl).toHaveBeenCalledTimes(1);
    const call = (search.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(call.options.mode).toBe('text');
  });

  it(`caps at ${SYSTEM_SCAN_MAX_SOURCES} sources without a prefilter query`, async () => {
    const points: FakePoint[] = [];
    for (let i = 0; i <= SYSTEM_SCAN_MAX_SOURCES; i++) {
      points.push(...fakeDoc('grundsatz_documents', `https://gruene.de/${i}`, [`Text ${i}.`]));
    }
    const { deps } = makeSystemDeps(points);
    const out = await loadSystemScanTexts({ collection: resolved('deutschland') }, deps);
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.sources).toHaveLength(SYSTEM_SCAN_MAX_SOURCES);
  });
});
