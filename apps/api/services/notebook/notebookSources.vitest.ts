/**
 * `notebookSources` gegen Fakes für Postgres, Notebook-Helper, Dokumentsuche
 * und Zugriff — kein Qdrant, kein Postgres. Jede Funktion nimmt nur die Deps,
 * die sie braucht.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  fetchDocumentMetadata,
  findPassages,
  listNotebookSources,
  loadMarkedPageRanges,
  markedPageAt,
  markedPageRanges,
  outlineSource,
  readSourceText,
  resolveSourceInNotebook,
  sliceSource,
  SLICE_DEFAULT_CHARS,
  SLICE_MAX_CHARS,
  type NotebookSourcesDeps,
} from './notebookSources.js';

import type { DocumentChunkItem } from '../document-services/DocumentSearchService/types.js';
import type { NotebookAccess } from '../../routes/notebook/notebookAccess.js';

const OWNER: NotebookAccess = { exists: true, isOwner: true, canRead: true, canEdit: true };
const DENIED: NotebookAccess = { exists: false, isOwner: false, canRead: false, canEdit: false };

function docRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd1',
    user_id: 'owner-1',
    title: 'Antrag Radweg',
    filename: 'radweg.pdf',
    page_count: 4,
    file_size: '2048',
    status: 'completed',
    source_type: 'manual',
    source_url: null,
    document_type: 'upload',
    created_at: new Date('2026-09-01T10:00:00Z'),
    vector_count: 3,
    wolke_share_link_id: null,
    metadata: { wordCount: 1200 },
    chars: 7800,
    ...over,
  };
}

function makeDeps(
  opts: {
    rows?: Array<Record<string, unknown>>;
    links?: string[];
    inCollection?: boolean;
    access?: NotebookAccess;
    markdown?: string | null;
    chunks?: DocumentChunkItem[];
    searchResults?: unknown[];
    /** `getDocumentChunks` schlägt mit diesem Fehlertext fehl. */
    chunkError?: string;
    /** `search` antwortet mit `success:false` und diesem Fehlertext. */
    searchError?: string;
  } = {}
) {
  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('markdown_content FROM documents')) {
        return opts.markdown === undefined ? [] : [{ markdown_content: opts.markdown }];
      }
      if (sql.includes('WHERE id = ANY($1)')) {
        const ids = params[0] as string[];
        return (opts.rows ?? [docRow()]).filter((r) => ids.includes(String(r.id)));
      }
      if (sql.includes('WHERE id = $1')) {
        return (opts.rows ?? [docRow()]).filter((r) => r.id === params[0]);
      }
      return [];
    }),
  };
  const helper = {
    getCollectionDocuments: vi.fn(async () =>
      (opts.links ?? ['d1']).map((document_id) => ({ document_id, added_at: '', added_by: null }))
    ),
    isDocumentInCollection: vi.fn(async () => opts.inCollection ?? true),
    getNotebookCollection: vi.fn(async () => ({ id: 'n1', name: 'Kreisverband' })),
  };
  const documentService = {
    getDocumentChunks: vi.fn(async () =>
      opts.chunkError
        ? { success: false, chunks: [], chunkCount: 0, error: opts.chunkError }
        : { success: true, chunks: opts.chunks ?? [], chunkCount: (opts.chunks ?? []).length }
    ),
    search: vi.fn(async () => ({
      success: !opts.searchError,
      ...(opts.searchError ? { error: opts.searchError } : {}),
      results: opts.searchResults ?? [],
      query: '',
      searchType: 'hybrid',
      message: '',
    })),
  };
  const rerank = vi.fn(
    async (input: {
      results: Array<{ document_id: string; chunk_index: number; similarity: number }>;
    }) => ({
      results: [...input.results].reverse().map((r, i) => ({ ...r, similarity: 0.9 - i * 0.1 })),
      referencesMap: {},
      contextSummary: '',
      rerankTimeMs: 1,
    })
  );
  const deps = {
    db,
    helper,
    documentService,
    access: vi.fn(async () => opts.access ?? OWNER),
    rerank,
  } as unknown as NotebookSourcesDeps;
  return { deps, db, helper, documentService, rerank };
}

function chunk(
  over: Partial<DocumentChunkItem> & { index: number; text: string }
): DocumentChunkItem {
  return {
    tokens: 10,
    pageNumber: null,
    charStart: null,
    charEnd: null,
    headingPath: null,
    heading: null,
    sectionIndex: null,
    chunkType: 'text',
    ...over,
  };
}

describe('fetchDocumentMetadata', () => {
  it('reads all rows in one query and never queries for an empty id list', async () => {
    const { db } = makeDeps();
    expect(await fetchDocumentMetadata(db, [])).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
    const rows = await fetchDocumentMetadata(db, ['d1']);
    expect(rows).toHaveLength(1);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(String(db.query.mock.calls[0]?.[0])).toContain('NULL::int AS chars');
  });

  it('computes the text length only when asked — the notebook page does not need it', async () => {
    const { db } = makeDeps();
    await fetchDocumentMetadata(db, ['d1'], { withChars: true });
    expect(String(db.query.mock.calls[0]?.[0])).toContain('length(markdown_content) AS chars');
  });

  it('asks for the text length from the source list', async () => {
    const { deps, db } = makeDeps();
    await listNotebookSources({ collectionId: 'n1' }, deps);
    expect(String(db.query.mock.calls[0]?.[0])).toContain('length(markdown_content) AS chars');
  });
});

describe('listNotebookSources', () => {
  const rows = [
    docRow({
      id: 'a',
      title: 'Beta',
      page_count: 2,
      created_at: new Date('2026-01-01'),
      metadata: { wordCount: 1200, tags: ['verkehr'] },
    }),
    docRow({
      id: 'b',
      title: 'alpha',
      page_count: null,
      created_at: new Date('2026-03-01'),
      metadata: {},
      chars: 650,
      status: 'failed',
    }),
    docRow({
      id: 'c',
      title: 'Gamma',
      page_count: 9,
      created_at: null,
      metadata: null,
      chars: null,
      source_type: 'wolke',
    }),
  ];

  it('maps rows to NotebookSourceRow with estimated words and tags', async () => {
    const { deps } = makeDeps({ rows, links: ['a', 'b', 'c'] });
    const out = await listNotebookSources({ collectionId: 'n1', sortBy: 'name' }, deps);
    expect(out.total).toBe(3);
    const b = out.items.find((i) => i.id === 'b');
    expect(b).toMatchObject({
      words: 100,
      wordsEstimated: true,
      chars: 650,
      pages: null,
      tags: [],
    });
    const a = out.items.find((i) => i.id === 'a');
    expect(a).toMatchObject({
      words: 1200,
      wordsEstimated: false,
      sizeBytes: 2048,
      tags: ['verkehr'],
    });
    const c = out.items.find((i) => i.id === 'c');
    expect(c).toMatchObject({ words: null, createdAt: null, sourceType: 'wolke' });
  });

  it('sorts by name ascending case-insensitively by default for name', async () => {
    const { deps } = makeDeps({ rows, links: ['a', 'b', 'c'] });
    const out = await listNotebookSources({ collectionId: 'n1', sortBy: 'name' }, deps);
    expect(out.items.map((i) => i.title)).toEqual(['alpha', 'Beta', 'Gamma']);
  });

  it('sorts by date descending by default and puts nulls last', async () => {
    const { deps } = makeDeps({ rows, links: ['a', 'b', 'c'] });
    const out = await listNotebookSources({ collectionId: 'n1' }, deps);
    expect(out.items.map((i) => i.id)).toEqual(['b', 'a', 'c']);
    const asc = await listNotebookSources(
      { collectionId: 'n1', sortBy: 'pages', order: 'asc' },
      deps
    );
    expect(asc.items.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by text length (chars) descending by default, unknown last', async () => {
    const { deps } = makeDeps({ rows, links: ['a', 'b', 'c'] });
    const out = await listNotebookSources({ collectionId: 'n1', sortBy: 'chars' }, deps);
    expect(out.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters before paging and reports total after filtering', async () => {
    const { deps } = makeDeps({ rows, links: ['a', 'b', 'c'] });
    const out = await listNotebookSources(
      { collectionId: 'n1', filter: { titleContains: 'A' }, sortBy: 'name', limit: 1, offset: 1 },
      deps
    );
    expect(out.total).toBe(3);
    expect(out.items.map((i) => i.title)).toEqual(['Beta']);
    const byStatus = await listNotebookSources(
      { collectionId: 'n1', filter: { status: 'failed' } },
      deps
    );
    expect(byStatus.items.map((i) => i.id)).toEqual(['b']);
    const byTag = await listNotebookSources(
      { collectionId: 'n1', filter: { tag: 'verkehr' } },
      deps
    );
    expect(byTag.items.map((i) => i.id)).toEqual(['a']);
    const byType = await listNotebookSources(
      { collectionId: 'n1', filter: { sourceType: 'wolke' } },
      deps
    );
    expect(byType.items.map((i) => i.id)).toEqual(['c']);
  });

  it('clamps limit to 50', async () => {
    const many = Array.from({ length: 60 }, (_, i) => docRow({ id: `d${i}`, title: `T${i}` }));
    const { deps } = makeDeps({ rows: many, links: many.map((r) => String(r.id)) });
    const out = await listNotebookSources({ collectionId: 'n1', limit: 500 }, deps);
    expect(out.total).toBe(60);
    expect(out.items).toHaveLength(50);
  });
});

describe('listNotebookSources — Dokumentdatum und Gremium', () => {
  const docMeta = (date: string, kind: string, gremium: string | null) => ({
    doc_meta: { version: 1, date, dateKind: kind, gremium },
  });
  const rows = [
    // Hochgeladen zuletzt, beschlossen am frühesten.
    docRow({
      id: 'bv',
      title: 'Klimaschutz jetzt',
      created_at: new Date('2026-03-12'),
      metadata: docMeta('2024-01-08', 'beschluss', 'Bundesvorstand'),
    }),
    docRow({
      id: 'pr',
      title: 'Klimaschutz jetzt',
      created_at: new Date('2026-01-01'),
      metadata: docMeta('2025-06-01', 'beschluss', 'Parteirat'),
    }),
    // Ohne Dokumentdatum: die Upload-Zeit zählt.
    docRow({ id: 'up', title: 'Notiz', created_at: new Date('2024-06-01'), metadata: {} }),
  ];

  it('trägt Dokumentdatum, Art und Gremium in die Zeile', async () => {
    const { deps } = makeDeps({ rows, links: ['bv', 'pr', 'up'] });
    const out = await listNotebookSources({ collectionId: 'n1' }, deps);
    expect(out.items.find((i) => i.id === 'bv')).toMatchObject({
      docDate: '2024-01-08',
      docDateKind: 'beschluss',
      gremium: 'Bundesvorstand',
    });
    expect(out.items.find((i) => i.id === 'up')).toMatchObject({
      docDate: null,
      docDateKind: null,
      gremium: null,
    });
  });

  it('sortiert nach Dokumentdatum, sonst nach Upload', async () => {
    const { deps } = makeDeps({ rows, links: ['bv', 'pr', 'up'] });
    const out = await listNotebookSources({ collectionId: 'n1', sortBy: 'date' }, deps);
    expect(out.items.map((i) => i.id)).toEqual(['pr', 'up', 'bv']);
  });

  it('filtert nach Gremium, gross/klein egal, ohne gleichnamige Titel zu verschmelzen', async () => {
    const { deps } = makeDeps({ rows, links: ['bv', 'pr', 'up'] });
    const out = await listNotebookSources(
      { collectionId: 'n1', filter: { gremium: 'parteirat' } },
      deps
    );
    expect(out.items.map((i) => i.id)).toEqual(['pr']);
  });
});

describe('resolveSourceInNotebook', () => {
  it('returns the owner of the source, not the caller', async () => {
    const { deps } = makeDeps({ rows: [docRow({ user_id: 'owner-9' })] });
    const out = await resolveSourceInNotebook(
      { collectionId: 'n1', sourceId: 'd1', userId: 'reader-1' },
      deps
    );
    expect(out).toEqual({
      ok: true,
      ownerUserId: 'owner-9',
      collectionName: 'Kreisverband',
      title: 'Antrag Radweg',
    });
  });

  it('refuses without read access', async () => {
    const { deps, helper } = makeDeps({ access: DENIED });
    const out = await resolveSourceInNotebook(
      { collectionId: 'n1', sourceId: 'd1', userId: 'x' },
      deps
    );
    expect(out).toEqual({ ok: false, error: 'Notebook nicht gefunden oder kein Zugriff.' });
    expect(helper.isDocumentInCollection).not.toHaveBeenCalled();
  });

  it('refuses a source that is not linked into the notebook', async () => {
    const { deps } = makeDeps({ inCollection: false });
    const out = await resolveSourceInNotebook(
      { collectionId: 'n1', sourceId: 'd9', userId: 'x' },
      deps
    );
    expect(out).toEqual({ ok: false, error: 'Quelle nicht in diesem Notebook oder kein Zugriff.' });
  });
});

describe('readSourceText', () => {
  it('prefers the original markdown and takes chunk offsets from the payload', async () => {
    const text = 'Kapitel 1\n\nDer Radweg kommt 2027.';
    const { deps, documentService } = makeDeps({
      markdown: text,
      chunks: [
        chunk({ index: 0, text: 'Kapitel 1', charStart: 0, charEnd: 9, pageNumber: 1 }),
        chunk({
          index: 1,
          text: 'Der Radweg kommt 2027.',
          charStart: 11,
          charEnd: 33,
          pageNumber: 2,
        }),
      ],
    });
    const out = await readSourceText({ sourceId: 'd1', ownerUserId: 'owner-1' }, deps);
    expect(out.origin).toBe('original');
    expect(out.text).toBe(text);
    expect(out.chunkMap).toEqual([
      { index: 0, charStart: 0, charEnd: 9, pageNumber: 1 },
      { index: 1, charStart: 11, charEnd: 33, pageNumber: 2 },
    ]);
    expect(documentService.getDocumentChunks).toHaveBeenCalledWith('owner-1', 'd1');
  });

  it('locates chunks without payload offsets sequentially in the original', async () => {
    const { deps } = makeDeps({
      markdown: 'aaa bbb aaa',
      chunks: [
        chunk({ index: 0, text: 'aaa' }),
        chunk({ index: 1, text: 'aaa' }),
        chunk({ index: 2, text: 'zzz' }),
      ],
    });
    const out = await readSourceText({ sourceId: 'd1', ownerUserId: 'o' }, deps);
    expect(out.chunkMap.map((c) => [c.charStart, c.charEnd])).toEqual([
      [0, 3],
      [8, 11],
      [11, 14],
    ]);
  });

  it('falls back to joined chunks with offsets into the joined text', async () => {
    const { deps } = makeDeps({
      markdown: '',
      chunks: [
        chunk({ index: 0, text: 'Eins', charStart: 500, charEnd: 504 }),
        chunk({ index: 1, text: 'Zwei' }),
      ],
    });
    const out = await readSourceText({ sourceId: 'd1', ownerUserId: 'o' }, deps);
    expect(out.origin).toBe('chunks');
    expect(out.text).toBe('Eins\n\nZwei');
    expect(out.chunkMap.map((c) => [c.charStart, c.charEnd])).toEqual([
      [0, 4],
      [6, 10],
    ]);
  });
});

describe('readSourceText — failed chunk reads', () => {
  it('throws when the chunk read fails, instead of reading as "no pages"', async () => {
    const { deps } = makeDeps({ markdown: 'Text', chunkError: 'Qdrant not available' });
    await expect(readSourceText({ sourceId: 'd1', ownerUserId: 'o' }, deps)).rejects.toThrow(
      /Qdrant not available/
    );
  });

  it('treats "No chunks found" as a source without chunks, not as a failure', async () => {
    const { deps } = makeDeps({ markdown: 'Nur Original', chunkError: 'No chunks found' });
    const out = await readSourceText({ sourceId: 'd1', ownerUserId: 'o' }, deps);
    expect(out).toMatchObject({ text: 'Nur Original', origin: 'original', chunkMap: [] });
  });
});

describe('sliceSource', () => {
  const text = 'x'.repeat(25_000);

  it('reads the default slice and points to the next one', () => {
    const out = sliceSource(text, { von: 0 }, []);
    expect(out.from).toBe(0);
    expect(out.to).toBe(SLICE_DEFAULT_CHARS);
    expect(out.total).toBe(25_000);
    expect(out.continuationHint).toBe('[Zeichen 0–10000 von 25000 — weiter mit von=10000]');
    expect(out.pageRange).toBeNull();
  });

  it('clamps zeichen to the hard max and has no hint at the end', () => {
    expect(sliceSource(text, { von: 0, zeichen: 99_999 }, []).to).toBe(SLICE_MAX_CHARS);
    const tail = sliceSource(text, { von: 20_000 }, []);
    expect(tail.to).toBe(25_000);
    expect(tail.continuationHint).toBeNull();
  });

  it('derives the page range from overlapping chunks', () => {
    const out = sliceSource('a'.repeat(300), { von: 50, zeichen: 200 }, [
      { index: 0, charStart: 0, charEnd: 100, pageNumber: 3 },
      { index: 1, charStart: 100, charEnd: 200, pageNumber: 4 },
      { index: 2, charStart: 260, charEnd: 300, pageNumber: 5 },
    ]);
    expect(out.pageRange).toEqual({ from: 3, to: 4 });
  });
});

describe('markedPageAt', () => {
  const TEXT_3P = '## Seite 1\nEins.\n## Seite 2\nZwei.\n## Seite 3\nDrei.';

  it('maps an offset to the page whose marker precedes it', () => {
    const ranges = markedPageRanges(TEXT_3P);
    expect(markedPageAt(ranges, TEXT_3P.indexOf('Eins'))).toBe(1);
    expect(markedPageAt(ranges, TEXT_3P.indexOf('Zwei'))).toBe(2);
    expect(markedPageAt(ranges, TEXT_3P.indexOf('Drei'))).toBe(3);
  });

  it('returns null without markers', () => {
    expect(markedPageAt(markedPageRanges('Kein Marker.'), 3)).toBeNull();
  });
});

describe('loadMarkedPageRanges', () => {
  it('skips the query without ids and maps rows to page ranges', async () => {
    const query = vi.fn(async () => [{ id: 'd1', markdown_content: '## Seite 4\nText' }]);
    expect((await loadMarkedPageRanges({ query } as never, [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
    const out = await loadMarkedPageRanges({ query } as never, ['d1']);
    expect(out.get('d1')?.map((r) => r.page)).toEqual([4]);
  });
});

describe('outlineSource', () => {
  it('groups consecutive chunks by section and falls back to the heading path', () => {
    const out = outlineSource([
      chunk({
        index: 0,
        text: 'aa',
        sectionIndex: 0,
        headingPath: ['Intro'],
        heading: 'Intro',
        pageNumber: 1,
      }),
      chunk({ index: 1, text: 'bbb', sectionIndex: 0, headingPath: ['Intro'], pageNumber: 2 }),
      chunk({ index: 2, text: 'c', sectionIndex: 1, headingPath: ['Teil A'], heading: 'Teil A' }),
      chunk({ index: 3, text: 'dd', headingPath: ['Anhang'], heading: 'Anhang' }),
      chunk({ index: 4, text: 'e', headingPath: ['Anhang'] }),
    ]);
    expect(out).toEqual([
      {
        sectionIndex: 0,
        headingPath: ['Intro'],
        heading: 'Intro',
        chunkFrom: 0,
        chunkTo: 1,
        pageFrom: 1,
        pageTo: 2,
        chars: 5,
      },
      {
        sectionIndex: 1,
        headingPath: ['Teil A'],
        heading: 'Teil A',
        chunkFrom: 2,
        chunkTo: 2,
        pageFrom: null,
        pageTo: null,
        chars: 1,
      },
      {
        sectionIndex: null,
        headingPath: ['Anhang'],
        heading: 'Anhang',
        chunkFrom: 3,
        chunkTo: 4,
        pageFrom: null,
        pageTo: null,
        chars: 3,
      },
    ]);
  });
});

describe('findPassages', () => {
  const searchResults = [
    {
      document_id: 'd1',
      title: 'Antrag Radweg',
      similarity_score: 0.8,
      top_chunks: [
        {
          chunk_index: 4,
          page_number: 2,
          preview: 'kurz',
          text: 'Der Radweg kommt 2027.',
          has_term: true,
          char_start: 100,
          char_end: 122,
        },
        {
          chunk_index: 7,
          page_number: null,
          preview: 'p',
          text: 'Zweite Stelle.',
          has_term: false,
          char_start: null,
          char_end: null,
        },
      ],
    },
    {
      document_id: 'd2',
      title: 'Protokoll',
      similarity_score: 0.6,
      top_chunks: [{ chunk_index: 1, preview: 'x', text: 'Radweg vertagt.', has_term: true }],
    },
  ];

  it('flattens top chunks into passages with locators, ordered by score', async () => {
    const { deps, documentService } = makeDeps({ searchResults });
    const out = await findPassages(
      {
        documentIds: ['d1', 'd2'],
        query: 'Radweg',
        mode: 'hybrid',
        limit: 2,
        rerank: false,
        userId: 'u',
      },
      deps
    );
    expect(out.reranked).toBe(false);
    expect(out.passages).toEqual([
      {
        sourceId: 'd1',
        title: 'Antrag Radweg',
        chunkIndex: 4,
        pageNumber: 2,
        charStart: 100,
        charEnd: 122,
        score: 0.8,
        hasTerm: true,
        text: 'Der Radweg kommt 2027.',
      },
      {
        sourceId: 'd1',
        title: 'Antrag Radweg',
        chunkIndex: 7,
        pageNumber: null,
        charStart: null,
        charEnd: null,
        score: 0.8,
        hasTerm: false,
        text: 'Zweite Stelle.',
      },
    ]);
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Radweg',
        userId: 'u',
        filters: { documentIds: ['d1', 'd2'] },
        options: expect.objectContaining({
          limit: 6,
          mode: 'hybrid',
          vectorWeight: 0.7,
          textWeight: 0.3,
          threshold: 0.2,
          searchCollection: 'documents',
        }),
      })
    );
  });

  it('runs vector mode through the hybrid path with vector-only weights', async () => {
    const { deps, documentService } = makeDeps({ searchResults });
    await findPassages(
      { documentIds: ['d1'], query: 'q', mode: 'vector', limit: 5, rerank: false, userId: 'u' },
      deps
    );
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ mode: 'hybrid', vectorWeight: 1, textWeight: 0 }),
      })
    );
  });

  it('reorders passages by the cross-encoder when rerank is on', async () => {
    const withFourth = [
      ...searchResults,
      {
        document_id: 'd3',
        title: 'Presse',
        similarity_score: 0.5,
        top_chunks: [{ chunk_index: 0, preview: 'y', text: 'Radweg im Kreis.' }],
      },
    ];
    const { deps, rerank } = makeDeps({ searchResults: withFourth });
    const out = await findPassages(
      {
        documentIds: ['d1', 'd2', 'd3'],
        query: 'Radweg',
        mode: 'text',
        limit: 20,
        rerank: true,
        userId: 'u',
      },
      deps
    );
    expect(rerank).toHaveBeenCalledTimes(1);
    expect(out.reranked).toBe(true);
    expect(out.passages.map((p) => [p.sourceId, p.chunkIndex])).toEqual([
      ['d3', 0],
      ['d2', 1],
      ['d1', 7],
      ['d1', 4],
    ]);
    expect(out.passages[0]?.score).toBeCloseTo(0.9);
    // Der Ausschnitt geht vollständig an den Cross-Encoder, nicht die Vorschau.
    expect(rerank.mock.calls[0]?.[0].results[0]).toMatchObject({
      chunk_text: 'Der Radweg kommt 2027.',
    });
  });

  it('skips the cross-encoder for three or fewer passages, like rerankNotebookResults itself', async () => {
    const { deps, rerank } = makeDeps({ searchResults });
    const out = await findPassages(
      {
        documentIds: ['d1', 'd2'],
        query: 'Radweg',
        mode: 'hybrid',
        limit: 20,
        rerank: true,
        userId: 'u',
      },
      deps
    );
    expect(rerank).not.toHaveBeenCalled();
    expect(out.reranked).toBe(false);
  });

  it('throws on a failed search instead of returning no passages', async () => {
    const { deps } = makeDeps({ searchError: 'embedding service down' });
    await expect(
      findPassages(
        { documentIds: ['d1'], query: 'q', mode: 'hybrid', limit: 5, rerank: false, userId: 'u' },
        deps
      )
    ).rejects.toThrow(/embedding service down/);
  });

  it('never searches for an empty notebook — that would scan the whole personal library', async () => {
    const { deps, documentService } = makeDeps({ searchResults });
    const out = await findPassages(
      { documentIds: [], query: 'Radweg', mode: 'hybrid', limit: 5, rerank: false, userId: 'u' },
      deps
    );
    expect(out).toEqual({ passages: [], reranked: false });
    expect(documentService.search).not.toHaveBeenCalled();
  });

  it('caps limit at 20', async () => {
    const { deps, documentService } = makeDeps({ searchResults });
    await findPassages(
      { documentIds: ['d1'], query: 'q', mode: 'hybrid', limit: 99, rerank: false, userId: 'u' },
      deps
    );
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ limit: 60 }) })
    );
  });
});
