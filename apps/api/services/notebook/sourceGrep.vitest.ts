/**
 * Wörtliche Vorkommen zählen (`grepText`) und die Texte eines Notebooks unter
 * einem Zeichenbudget laden (`loadScanTexts`). Die Zählung wird dem Modell als
 * Gesamtzahl gemeldet — deshalb prüfen die Tests die Wortgrenzen mit Umlauten,
 * die Trennungen und `exhaustive`.
 */
import { describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }),
}));

import { fakeChunk, fakeNotebookDeps, DENIED } from './__fixtures__/fakeNotebookSources.js';
import { grepSources, grepText, loadScanTexts, type GrepTextResult } from './sourceGrep.js';

const ok = (result: GrepTextResult): GrepTextResult => result;

describe('grepText', () => {
  it('matches whole words only', () => {
    const r = ok(grepText('Der Radweg und das Rad. Rad!', 'Rad', {}));
    expect(r.count).toBe(2);
    expect(r.hits.map((h) => h.charStart)).toEqual([19, 24]);
  });

  it('treats umlauts as letters at the word boundary', () => {
    // Mit \b stünde zwischen „z" und „ö" eine Grenze — „Öl" träfe dann „Heizöl".
    const r = ok(grepText('Heizöl ist kein Öl-Ersatz, Öl bleibt Öl', 'Öl', {}));
    expect(r.count).toBe(3);
    const u = ok(grepText('Übergrün und grün', 'grün', {}));
    expect(u.count).toBe(1);
  });

  it('folds case and diacritics but reports offsets into the original', () => {
    const text = 'Laut MÜLLER und Café gilt das.';
    const r = ok(grepText(text, 'müller', {}));
    expect(r.count).toBe(1);
    const [hit] = r.hits;
    expect(text.slice(hit!.charStart, hit!.charEnd)).toBe('MÜLLER');
    expect(ok(grepText(text, 'cafe', {})).count).toBe(1);
    // ß bleibt ß: „Strasse" ist ein anderes Wort als „Straße".
    expect(ok(grepText('Die Straße', 'strasse', {})).count).toBe(0);
    expect(ok(grepText('Die STRAẞE', 'straße', {})).count).toBe(1);
  });

  it('folds decomposed (NFD) text and phrases', () => {
    const nfd = 'Herr Mu\u0308ller kommt.';
    const r = ok(grepText(nfd, 'Müller', {}));
    expect(r.count).toBe(1);
    expect(nfd.slice(r.hits[0]!.charStart, r.hits[0]!.charEnd)).toBe('Mu\u0308ller');
    expect(ok(grepText('Herr Müller kommt.', 'Mu\u0308ller', {})).count).toBe(1);
  });

  it('keeps a trailing NFD accent inside the hit', () => {
    const text = 'Das Cafe\u0301 hat zu.';
    const r = ok(grepText(text, 'Café', {}));
    expect(r.count).toBe(1);
    expect(text.slice(r.hits[0]!.charStart, r.hits[0]!.charEnd)).toBe('Cafe\u0301');
  });

  it('honours caseSensitive', () => {
    expect(ok(grepText('Grüne und grüne', 'Grüne', { caseSensitive: true })).count).toBe(1);
  });

  it('caseSensitive keeps accents exact, also for NFD text', () => {
    const nfd = 'Das Cafe\u0301 und das Cafe.';
    const r = ok(grepText(nfd, 'Cafe', { caseSensitive: true }));
    expect(r.count).toBe(1);
    expect(nfd.slice(r.hits[0]!.charStart, r.hits[0]!.charEnd)).toBe('Cafe');
    expect(ok(grepText(nfd, 'Cafe\u0301', { caseSensitive: true })).count).toBe(1);
    expect(ok(grepText('Das Café.', 'Cafe', { caseSensitive: true })).count).toBe(0);
  });

  it('ignores soft hyphens and line-break hyphenation, keeping original offsets', () => {
    const soft = 'Der Klima\u00ADschutz zählt.';
    const r = ok(grepText(soft, 'Klimaschutz', {}));
    expect(r.count).toBe(1);
    expect(soft.slice(r.hits[0]!.charStart, r.hits[0]!.charEnd)).toBe('Klima\u00ADschutz');

    const broken = 'Wir fordern Klima-\nschutz jetzt.';
    const b = ok(grepText(broken, 'Klimaschutz', {}));
    expect(b.count).toBe(1);
    expect(broken.slice(b.hits[0]!.charStart, b.hits[0]!.charEnd)).toBe('Klima-\nschutz');
  });

  it('keeps a real hyphen before a capitalised word', () => {
    expect(ok(grepText('Rad-\nWege', 'RadWege', {})).count).toBe(0);
  });

  it('keeps a completion hyphen before a conjunction at the line break', () => {
    const text = 'Wind-\nund Solarenergie';
    expect(ok(grepText(text, 'Wind', {})).count).toBe(1);
    expect(ok(grepText(text, 'Windund', {})).count).toBe(0);
  });

  it('matches any whitespace between the words of a phrase', () => {
    const r = ok(grepText('die grüne\n  Partei und die grüne Partei', 'grüne Partei', {}));
    expect(r.count).toBe(2);
  });

  it('matches regex metacharacters literally', () => {
    expect(ok(grepText('Wert 125 und 1.5', '1.5', {})).count).toBe(1);
    expect(ok(grepText('(a+b) ist nicht ab', '(a+b)', {})).count).toBe(1);
    const text = 'Sie lernt C++ (Programmiersprache) und C.';
    expect(ok(grepText(text, 'C++ (Programmiersprache)', {})).count).toBe(1);
    expect(ok(grepText('aaaa', '(a+)+$', {})).count).toBe(0);
  });

  it('returns at most `contexts` hits, each with ±120 collapsed chars', () => {
    const text = `${'a '.repeat(100)}Radweg\n\n${'b '.repeat(100)} Radweg Radweg Radweg`;
    const r = ok(grepText(text, 'Radweg', { contexts: 2 }));
    expect(r.count).toBe(4);
    expect(r.hits).toHaveLength(2);
    expect(r.hits[0]!.context).toBe(`${'a '.repeat(60).trim()} Radweg ${'b '.repeat(59).trim()}`);
    expect(ok(grepText(text, 'Radweg', { contexts: 0 })).hits).toEqual([]);
  });

  it('counts only the hits `accept` lets through, with the original spelling', () => {
    const text = 'Orbán sagt, Orban sagt, ORBAN sagt.';
    const seen: string[] = [];
    const r = ok(
      grepText(text, 'Orban', {
        accept: (m) => {
          seen.push(m);
          return m.toLowerCase() === 'orban';
        },
      })
    );
    expect(seen).toEqual(['Orbán', 'Orban', 'ORBAN']);
    expect(r.count).toBe(2);
    expect(r.hits.map((h) => h.charStart)).toEqual([12, 24]);
  });
});

describe('grepSources', () => {
  it('sorts sources by count, drops those without hits and adds page numbers', () => {
    const out = grepSources(
      [
        {
          sourceId: 'd1',
          title: 'Eins',
          text: 'Radweg hier.',
          chunkMap: [{ index: 0, charStart: 0, charEnd: 12, pageNumber: 3 }],
        },
        { sourceId: 'd2', title: 'Zwei', text: 'Radweg und Radweg.', chunkMap: [] },
        { sourceId: 'd3', title: 'Drei', text: 'Nichts.', chunkMap: [] },
      ],
      'Radweg',
      {}
    );
    expect(out.totalHits).toBe(3);
    expect(out.perSource.map((s) => [s.sourceId, s.count])).toEqual([
      ['d2', 2],
      ['d1', 1],
    ]);
    expect(out.perSource[1]!.contexts[0]).toEqual({
      charStart: 0,
      pageNumber: 3,
      text: 'Radweg hier.',
    });
  });

  // Drei markierte Seiten; der eine Chunk beginnt auf Seite 1 und reicht bis Seite 3.
  const MARKED = '## Seite 1\nEinleitung.\n\n## Seite 2\nDer Radweg kommt.\n\n## Seite 3\nSchluss.';
  const ONE_CHUNK = [{ index: 0, charStart: 0, charEnd: MARKED.length, pageNumber: 1 }];

  it('takes the page of a hit from the page markers, not from the chunk start', () => {
    const out = grepSources(
      [{ sourceId: 'd1', title: 'Eins', text: MARKED, chunkMap: ONE_CHUNK }],
      'Radweg',
      {}
    );
    expect(out.perSource[0]!.contexts[0]!.pageNumber).toBe(2);
  });

  it('keeps the chunk page when the text has no page markers', () => {
    const plain = MARKED.replace(/## Seite \d\n/g, '');
    const out = grepSources(
      [
        {
          sourceId: 'd1',
          title: 'Eins',
          text: plain,
          chunkMap: [{ index: 0, charStart: 0, charEnd: plain.length, pageNumber: 1 }],
        },
      ],
      'Radweg',
      {}
    );
    expect(out.perSource[0]!.contexts[0]!.pageNumber).toBe(1);
  });
});

describe('loadScanTexts', () => {
  it('names the source, not the notebook, when one requested source exceeds the budget', async () => {
    const { deps } = fakeNotebookDeps([{ id: 'd1', title: 'Lang', text: 'x'.repeat(50) }]);
    const out = await loadScanTexts(
      { collectionId: 'n1', userId: 'u1', sourceId: 'd1', charBudget: 20 },
      deps
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.incompleteReason).toBe('Quelle zu groß — lies sie mit read abschnittsweise');
    expect(out.sources[0]!.text).toHaveLength(20);
  });

  const small = [
    { id: 'd1', text: 'Der Radweg kommt.' },
    { id: 'd2', text: 'Kein Thema.' },
  ];

  it('loads every source and is exhaustive when the notebook fits the budget', async () => {
    const { deps } = fakeNotebookDeps(small);
    const out = await loadScanTexts({ collectionId: 'n1', userId: 'u1' }, deps);
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(true);
    expect(out.sources.map((s) => s.text)).toEqual(['Der Radweg kommt.', 'Kein Thema.']);
  });

  it('falls back to the joined chunks when a source has no original', async () => {
    const { deps } = fakeNotebookDeps([
      { id: 'd1', text: null, chunks: [fakeChunk({ index: 0, text: 'Aus Chunks.' })] },
    ]);
    const out = await loadScanTexts({ collectionId: 'n1', userId: 'u1' }, deps);
    if ('error' in out) throw new Error(out.error);
    expect(out.sources[0]!.text).toBe('Aus Chunks.');
  });

  it('pre-filters by a text search when the notebook exceeds the budget', async () => {
    const { deps, documentService } = fakeNotebookDeps(
      [
        { id: 'd1', text: 'Der Radweg kommt.', chars: 3_000_000 },
        { id: 'd2', text: 'Kein Thema.', chars: 3_000_000 },
      ],
      {
        searchResults: [
          {
            document_id: 'd1',
            title: 'd1',
            similarity_score: 0.5,
            top_chunks: [{ chunk_index: 0, preview: 'Radweg', text: 'Der Radweg kommt.' }],
          },
        ],
      }
    );
    const out = await loadScanTexts(
      { collectionId: 'n1', userId: 'u1', prefilterQuery: 'Radweg' },
      deps
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.incompleteReason).toBe('Notebook zu groß');
    expect(out.sources.map((s) => s.sourceId)).toEqual(['d1']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[notebook_quellen:scan-prefilter]'));
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Radweg',
        options: expect.objectContaining({ mode: 'text' }),
      })
    );
  });

  it('cuts the text at the budget and says it is not exhaustive', async () => {
    const { deps } = fakeNotebookDeps([
      { id: 'd1', text: 'a'.repeat(30), chars: null },
      { id: 'd2', text: 'b'.repeat(30), chars: null },
    ]);
    const out = await loadScanTexts({ collectionId: 'n1', userId: 'u1', charBudget: 40 }, deps);
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.sources.map((s) => s.text.length)).toEqual([30, 10]);
  });

  it('refuses a notebook the caller cannot read', async () => {
    const { deps } = fakeNotebookDeps(small, { access: DENIED });
    expect(await loadScanTexts({ collectionId: 'n1', userId: 'u1' }, deps)).toEqual({
      error: 'Notebook nicht gefunden oder kein Zugriff.',
    });
  });

  it('names unreadable sources, not size, when a resolve failed', async () => {
    const { deps } = fakeNotebookDeps(small, { notInCollection: ['d2'] });
    const out = await loadScanTexts({ collectionId: 'n1', userId: 'u1' }, deps);
    if ('error' in out) throw new Error(out.error);
    expect(out.exhaustive).toBe(false);
    expect(out.incompleteReason).toBe('1 Quelle nicht lesbar');
    expect(out.sources.map((s) => s.sourceId)).toEqual(['d1']);
  });

  it('checks a single source against the notebook', async () => {
    const { deps } = fakeNotebookDeps(small, { notInCollection: ['d2'] });
    expect(await loadScanTexts({ collectionId: 'n1', userId: 'u1', sourceId: 'd2' }, deps)).toEqual(
      { error: 'Quelle nicht in diesem Notebook oder kein Zugriff.' }
    );
    const one = await loadScanTexts({ collectionId: 'n1', userId: 'u1', sourceId: 'd1' }, deps);
    if ('error' in one) throw new Error(one.error);
    expect(one.sources.map((s) => s.sourceId)).toEqual(['d1']);
    expect(one.exhaustive).toBe(true);
  });
});
