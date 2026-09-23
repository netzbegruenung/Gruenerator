/**
 * `notebook_quellen` gegen Fakes für Helper, Zugriff, Postgres, Dokumentsuche
 * und Rerank — kein Qdrant, kein Postgres. Alles kommt über `ctx.deps` herein,
 * wie bei `notebookTools.vitest.ts`; die Service-Funktionen darunter laufen echt.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  makeNotebookSourcesTool,
  READ_ACTIONS,
  type NotebookSourceToolDeps,
} from './notebookSourceTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { DocumentChunkItem } from '../../../services/document-services/DocumentSearchService/types.js';
import type { StatsNlp } from '../../../services/notebook/sourceStats.js';
import type { NotebookAccess } from '../../notebook/notebookAccess.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

const OWNER: NotebookAccess = { exists: true, isOwner: true, canRead: true, canEdit: true };
const READER: NotebookAccess = { exists: true, isOwner: false, canRead: true, canEdit: false };
const DENIED: NotebookAccess = { exists: false, isOwner: false, canRead: false, canEdit: false };

function collection(over: Partial<NotebookCollection> = {}): NotebookCollection {
  return {
    id: 'n1',
    user_id: 'owner-1',
    name: 'Kreisverband',
    description: null,
    slug_suffix: 'Ab3xK9',
    document_count: 2,
    share_mode: 'private',
    edit_policy: 'owner_only',
    is_public: false,
    public_ownership: null,
    audience: 'de-DE',
    settings: {},
    ...over,
  } as NotebookCollection;
}

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

const TEXT = 'Einleitung zum Radweg.\n\nDer Radweg kommt 2027.\n\nAnhang mit Zahlen.';
const CHUNKS = [
  chunk({
    index: 0,
    text: 'Einleitung zum Radweg.',
    charStart: 0,
    charEnd: 22,
    pageNumber: 1,
    sectionIndex: 0,
    headingPath: ['Einleitung'],
    heading: 'Einleitung',
  }),
  chunk({
    index: 1,
    text: 'Der Radweg kommt 2027.',
    charStart: 24,
    charEnd: 46,
    pageNumber: 2,
    sectionIndex: 1,
    headingPath: ['Beschluss'],
    heading: 'Beschluss',
  }),
  chunk({
    index: 2,
    text: 'Anhang mit Zahlen.',
    charStart: 48,
    charEnd: 66,
    pageNumber: 3,
    sectionIndex: 2,
    headingPath: ['Anhang'],
    heading: 'Anhang',
  }),
];

interface CtxOptions {
  userId?: string | null;
  notebookIds?: string[];
  access?: NotebookAccess;
  collection?: NotebookCollection | null;
  rows?: Array<Record<string, unknown>>;
  links?: string[];
  inCollection?: boolean;
  markdown?: string | null;
  chunks?: DocumentChunkItem[];
  searchResults?: unknown[];
  registry?: SourceRegistry;
  chunkError?: string;
  searchError?: string;
  /** `getCollectionDocuments` wirft diesen Rohtext. */
  linksThrow?: string;
  /** Originaltext je Quelle; sonst gilt `markdown` für alle. */
  markdownById?: Record<string, string>;
  nlp?: StatsNlp;
}

function makeCtx(opts: CtxOptions = {}) {
  const notes: Array<[string, string]> = [];
  const registered: Array<{ results: Array<Record<string, unknown>>; opts: unknown }> = [];
  const sourceRegistry =
    opts.registry ??
    ({
      note: (title: string, content: string) => notes.push([title, content]),
      register: (results: Array<Record<string, unknown>>, o: unknown) => {
        registered.push({ results, opts: o });
        return '[1] Auszug';
      },
    } as unknown as SourceRegistry);
  const sse = { send: () => {} } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'user-1' : opts.userId },
    userLocale: 'de-DE',
    messages: [],
    notebookIds: opts.notebookIds ?? ['n1'],
  } as unknown as ChatGraphState;

  const row = opts.collection === undefined ? collection() : opts.collection;
  const rows = opts.rows ?? [docRow()];
  const helper = {
    getNotebookCollection: vi.fn(async (id: string) => (row && id === row.id ? row : null)),
    getCollectionDocuments: vi.fn(async () => {
      if (opts.linksThrow) throw new Error(opts.linksThrow);
      return (opts.links ?? ['d1']).map((document_id) => ({
        document_id,
        added_at: '',
        added_by: null,
      }));
    }),
    isDocumentInCollection: vi.fn(async () => opts.inCollection ?? true),
  };
  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('markdown_content FROM documents')) {
        const own = opts.markdownById?.[String(params[0])];
        if (own !== undefined) return [{ markdown_content: own }];
        return opts.markdown === undefined
          ? [{ markdown_content: TEXT }]
          : [{ markdown_content: opts.markdown }];
      }
      if (sql.includes('WHERE id = ANY($1)')) {
        const ids = params[0] as string[];
        return rows.filter((r) => ids.includes(String(r.id)));
      }
      if (sql.includes('WHERE id = $1')) return rows.filter((r) => r.id === params[0]);
      return [];
    }),
  };
  const documentService = {
    getDocumentChunks: vi.fn(async () =>
      opts.chunkError
        ? { success: false, chunks: [], chunkCount: 0, error: opts.chunkError }
        : {
            success: true,
            chunks: opts.chunks ?? CHUNKS,
            chunkCount: (opts.chunks ?? CHUNKS).length,
          }
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
  const deps = {
    helper,
    db,
    documentService,
    access: vi.fn(async () => opts.access ?? OWNER),
    rerank: vi.fn(),
    recentSteps: vi.fn(async () => []),
    ...(opts.nlp ? { nlp: opts.nlp } : {}),
  } as unknown as NotebookSourceToolDeps;
  const tool = makeNotebookSourcesTool({ state, sse, threadId: 't1', sourceRegistry, deps });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { mode: 'hybrid', rerank: false, ...args },
      {}
    )) ?? {};
  return { run, notes, registered, helper, db, documentService, deps };
}

describe('schema', () => {
  it('builds the action enum from READ_ACTIONS', () => {
    expect(READ_ACTIONS).toEqual([
      'list',
      'outline',
      'read',
      'find',
      'grep',
      'stats',
      'rank',
      'cite',
    ]);
  });
});

describe('notebook resolution', () => {
  it('needs a session', async () => {
    const { run } = makeCtx({ userId: null });
    expect((await run({ action: 'list' })).error).toMatch(/Nutzer-Sitzung/);
  });

  it('defaults to the first selected user notebook, skipping system collections', async () => {
    const { run, helper } = makeCtx({ notebookIds: ['grundsatz-system', 'n1'] });
    const out = await run({ action: 'list' });
    expect(out.notebook).toBe('Kreisverband');
    expect(helper.getNotebookCollection).toHaveBeenCalledWith('n1');
  });

  it('says so when no notebook is selected', async () => {
    const { run } = makeCtx({ notebookIds: [] });
    expect((await run({ action: 'list' })).error).toMatch(/notebookId/);
  });

  it('hides notebooks the caller cannot read', async () => {
    const { run } = makeCtx({ access: DENIED });
    expect((await run({ action: 'list' })).error).toBe(
      'Notebook nicht gefunden oder kein Zugriff.'
    );
  });
});

describe('list', () => {
  it('lists sources as grounded rows with the source id as ref', async () => {
    const { run, registered } = makeCtx({
      rows: [
        docRow(),
        docRow({ id: 'd2', title: 'Protokoll', page_count: null, metadata: {}, chars: 650 }),
      ],
      links: ['d1', 'd2'],
    });
    const out = await run({ action: 'list', sortBy: 'name' });
    expect(out).toMatchObject({
      notebook: 'Kreisverband',
      total: 2,
      offset: 0,
      limit: 20,
      sortBy: 'name',
    });
    const results = out.results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({
      title: 'Antrag Radweg',
      url: '/notebooks/kreisverband-Ab3xK9',
      ref: 'd1',
      snippet: 'manual · 2026-09-01 · 4 S. · 1200 Wörter',
    });
    expect(results[1]?.snippet).toBe('manual · 2026-09-01 · ~100 Wörter');
    expect(registered).toHaveLength(1);
    expect(out.refs).toBe('Antrag Radweg — d1 (2026-09-01)\nProtokoll — d2 (2026-09-01)');
  });
});

describe('outline', () => {
  it('returns the outline and grounds it as one note-like source', async () => {
    const { run, registered } = makeCtx();
    const out = await run({ action: 'outline', sourceId: 'd1' });
    expect(out.source).toEqual({ id: 'd1', title: 'Antrag Radweg' });
    expect((out.outline as unknown[]).length).toBe(3);
    expect(registered).toHaveLength(1);
    const [entry] = registered[0]!.results;
    expect(entry).toMatchObject({
      source: 'notebook',
      title: 'Gliederung: Antrag Radweg',
      documentId: 'd1',
      collectionId: 'n1',
    });
    expect(String(entry?.content)).toContain('2. Beschluss (section=1, Chunks 1–1, S. 2)');
    expect(registered[0]!.opts).toEqual({ snippetChars: 4000 });
  });

  it('needs a sourceId', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'outline' })).error).toMatch(/sourceId/);
  });

  it('refuses a source outside the notebook', async () => {
    const { run } = makeCtx({ inCollection: false });
    expect((await run({ action: 'outline', sourceId: 'dx' })).error).toBe(
      'Quelle nicht in diesem Notebook oder kein Zugriff.'
    );
  });
});

describe('read', () => {
  it('reads from the start by default and reads with the owner id in a shared notebook', async () => {
    const { run, documentService } = makeCtx({ access: READER, userId: 'reader-7' });
    const out = await run({ action: 'read', sourceId: 'd1' });
    expect(out).toMatchObject({
      source: { id: 'd1', title: 'Antrag Radweg' },
      from: 0,
      to: TEXT.length,
      total: TEXT.length,
      pageRange: { from: 1, to: 3 },
      origin: 'original',
      text: TEXT,
      continuationHint: null,
    });
    expect(documentService.getDocumentChunks).toHaveBeenCalledWith('owner-1', 'd1');
  });

  it('reads a page', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'read', sourceId: 'd1', seite: 2 });
    expect(out.text).toBe('Der Radweg kommt 2027.');
    expect(out.pageRange).toEqual({ from: 2, to: 2 });
  });

  it('names chunk and character navigation when the source has no pages', async () => {
    const { run } = makeCtx({ chunks: CHUNKS.map((c) => ({ ...c, pageNumber: null })) });
    const out = await run({ action: 'read', sourceId: 'd1', seite: 1 });
    expect(out.error).toMatch(/abschnitt/);
    expect(out.error).toMatch(/chunks/);
  });

  it('reads a section and a chunk range', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'read', sourceId: 'd1', section: 2 })).text).toBe(
      'Anhang mit Zahlen.'
    );
    expect((await run({ action: 'read', sourceId: 'd1', chunks: { from: 0, to: 1 } })).text).toBe(
      'Einleitung zum Radweg.\n\nDer Radweg kommt 2027.'
    );
  });

  it('reads a character slice and says where to continue', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'read', sourceId: 'd1', abschnitt: { von: 24, zeichen: 200 } });
    expect(out.from).toBe(24);
    expect(out.continuationHint).toBeNull();
    const long = makeCtx({ markdown: 'x'.repeat(30_000), chunks: [] });
    const first = await long.run({ action: 'read', sourceId: 'd1' });
    expect(first.continuationHint).toBe('[Zeichen 0–10000 von 30000 — weiter mit von=10000]');
  });

  it('takes exactly one navigation argument', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'read', sourceId: 'd1', seite: 1, section: 0 });
    expect(out.error).toMatch(/genau eine/);
  });

  it('reports a slice start past the end', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'read', sourceId: 'd1', abschnitt: { von: 99_999 } });
    expect(out.error).toMatch(/hinter dem Ende/);
  });
});

describe('find', () => {
  const searchResults = [
    {
      document_id: 'd1',
      title: 'Antrag Radweg',
      similarity_score: 0.8,
      top_chunks: [
        {
          chunk_index: 1,
          page_number: 2,
          preview: 'kurz',
          text: 'Der Radweg kommt 2027.',
          has_term: true,
          char_start: 24,
          char_end: 46,
        },
      ],
    },
  ];

  it('returns passages with locators and grounds each as a source', async () => {
    const { run, registered, documentService } = makeCtx({ searchResults, links: ['d1', 'd2'] });
    const out = await run({ action: 'find', query: 'Radweg' });
    expect(out).toMatchObject({
      notebook: 'Kreisverband',
      query: 'Radweg',
      mode: 'hybrid',
      reranked: false,
      resultCount: 1,
      sources: '[1] Auszug',
    });
    expect(out.passages).toEqual([
      {
        sourceId: 'd1',
        title: 'Antrag Radweg',
        chunkIndex: 1,
        pageNumber: 2,
        charStart: 24,
        charEnd: 46,
        score: 0.8,
        hasTerm: true,
        excerpt: 'Der Radweg kommt 2027.',
      },
    ]);
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { documentIds: ['d1', 'd2'] } })
    );
    expect(registered[0]!.results[0]).toMatchObject({
      source: 'notebook',
      documentId: 'd1',
      collectionId: 'n1',
      chunkIndex: 1,
      pageNumber: 2,
      charStart: 24,
      charEnd: 46,
      relevance: 0.8,
      citedText: 'Der Radweg kommt 2027.',
    });
  });

  it('narrows to one source after checking it belongs to the notebook', async () => {
    const { run, documentService, helper } = makeCtx({ searchResults });
    await run({ action: 'find', query: 'Radweg', sourceId: 'd1' });
    expect(helper.isDocumentInCollection).toHaveBeenCalledWith('n1', 'd1');
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { documentIds: ['d1'] } })
    );
  });

  it('needs a query', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'find' })).error).toMatch(/query/);
  });

  it('notes an empty result instead of registering nothing silently', async () => {
    const { run, notes } = makeCtx({ searchResults: [] });
    const out = await run({ action: 'find', query: 'Mond' });
    expect(out.resultCount).toBe(0);
    expect(notes).toHaveLength(1);
  });
});

const TWO_ROWS = [
  docRow(),
  docRow({
    id: 'd2',
    title: 'Protokoll',
    page_count: 9,
    created_at: new Date('2026-09-10T10:00:00Z'),
    chars: 9000,
  }),
];
const TWO_TEXTS = { d1: TEXT, d2: 'Radweg! Sonst nichts.' };

describe('grep', () => {
  it('counts every occurrence in the notebook and grounds one source per source with hits', async () => {
    const { run, registered } = makeCtx({
      rows: TWO_ROWS,
      links: ['d1', 'd2'],
      markdownById: TWO_TEXTS,
    });
    const out = await run({ action: 'grep', phrase: 'radweg' });
    expect(out).toMatchObject({
      notebook: 'Kreisverband',
      phrase: 'radweg',
      exhaustive: true,
      totalHits: 3,
      sourcesScanned: 2,
      sourcesWithHits: 2,
    });
    expect(out).not.toHaveProperty('note');
    const [first] = out.perSource as Array<Record<string, unknown>>;
    expect(first).toMatchObject({ sourceId: 'd1', title: 'Antrag Radweg', count: 2 });
    expect((first!.contexts as unknown[])[0]).toEqual({
      charStart: 15,
      pageNumber: 1,
      text: TEXT.replace(/\s+/g, ' '),
    });
    expect(registered[0]!.results).toHaveLength(2);
    expect(registered[0]!.results[0]).toMatchObject({
      source: 'notebook',
      title: 'Antrag Radweg',
      documentId: 'd1',
      collectionId: 'n1',
      charStart: 15,
      pageNumber: 1,
      citedText: TEXT.replace(/\s+/g, ' '),
    });
  });

  it('says the count is a lower bound when only pre-filtered sources were scanned', async () => {
    const { run } = makeCtx({
      rows: TWO_ROWS.map((r) => ({ ...r, chars: 3_000_000 })),
      links: ['d1', 'd2'],
      markdownById: TWO_TEXTS,
      searchResults: [
        {
          document_id: 'd2',
          title: 'Protokoll',
          similarity_score: 0.5,
          top_chunks: [{ chunk_index: 0, preview: '', text: 'Radweg! Sonst nichts.' }],
        },
      ],
    });
    const out = await run({ action: 'grep', phrase: 'Radweg' });
    expect(out).toMatchObject({ exhaustive: false, totalHits: 1, sourcesScanned: 1 });
    expect(out.note).toBe(
      'Nicht alle Quellen wurden gelesen (Notebook zu groß) — totalHits ist eine Untergrenze, keine Gesamtzahl.'
    );
  });

  it('needs a phrase of at least two characters', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'grep' })).error).toBe(
      'grep braucht phrase (mindestens 2 Zeichen).'
    );
  });

  it('matches a phrase with regex metacharacters literally', async () => {
    const { run } = makeCtx({ markdown: 'Kurs: C++ (Programmiersprache) für Einsteiger.' });
    const out = await run({ action: 'grep', phrase: 'C++ (Programmiersprache)' });
    expect(out).toMatchObject({ totalHits: 1, exhaustive: true });
  });

  it('notes zero hits instead of registering nothing silently', async () => {
    const { run, notes, registered } = makeCtx();
    const out = await run({ action: 'grep', phrase: 'Mondbasis' });
    expect(out).toMatchObject({ totalHits: 0, exhaustive: true, perSource: [] });
    expect(registered).toEqual([]);
    expect(notes[0]).toEqual(['Notebook „Kreisverband"', 'Keine Treffer für „Mondbasis".']);
    expect(notes[1]?.[1]).toContain('totalHits: 0');
    expect(notes[1]?.[1]).toContain('exhaustive: ja');
  });
});

describe('stats', () => {
  it('counts the whole notebook and grounds one table', async () => {
    const { run, registered } = makeCtx({
      rows: TWO_ROWS,
      links: ['d1', 'd2'],
      markdownById: TWO_TEXTS,
    });
    const out = await run({ action: 'stats' });
    expect(out).toMatchObject({
      notebook: 'Kreisverband',
      scope: 'notebook',
      exhaustive: true,
      nlpAvailable: null,
      totals: { words: 13, sentences: 5, paragraphs: 4, pages: 13, chunks: 6 },
    });
    expect((out.perSource as unknown[]).length).toBe(2);
    expect(registered).toHaveLength(1);
    expect(registered[0]!.opts).toEqual({ snippetChars: 4000 });
    const [entry] = registered[0]!.results;
    expect(entry).toMatchObject({ source: 'notebook', title: 'Statistik: Kreisverband' });
    expect(String(entry?.content)).toContain('Antrag Radweg: 10 Wörter');
  });

  it('adds lemma counts from the NLP service', async () => {
    const nlp: StatsNlp = {
      checkHealth: vi.fn(async () => true),
      textStatsBatched: vi.fn(async (texts: Array<{ id: string }>) =>
        texts.map((t) => ({
          id: t.id,
          tokens: 1,
          words: 1,
          sentences: 1,
          lemmas: [{ lemma: 'radweg', pos: 'NOUN', count: 2 }],
          forms: { Radweg: [{ form: 'Radweg', count: 2 }] },
        }))
      ),
    };
    const { run } = makeCtx({ nlp });
    const out = await run({ action: 'stats', sourceId: 'd1', lemmas: true, lemmaOf: ['Radweg'] });
    expect(out).toMatchObject({
      scope: 'source',
      source: { id: 'd1', title: 'Antrag Radweg' },
      nlpAvailable: true,
      lemmas: [{ lemma: 'radweg', pos: 'NOUN', count: 2 }],
      lemmaOf: [{ lemma: 'Radweg', total: 2, forms: [{ form: 'Radweg', count: 2 }] }],
      lemmasExhaustive: true,
    });
  });

  it('degrades to text counts when the NLP service is down', async () => {
    const nlp: StatsNlp = {
      checkHealth: vi.fn(async () => false),
      textStatsBatched: vi.fn(async () => []),
    };
    const { run } = makeCtx({ nlp });
    const out = await run({ action: 'stats', lemmas: true });
    expect(out.nlpAvailable).toBe(false);
    expect(out.note).toMatch(/Lemma-Zählungen sind gerade nicht verfügbar/);
    expect((out.totals as Record<string, number>).words).toBe(10);
  });
});

describe('rank', () => {
  it('ranks by date, length and pages from the source metadata', async () => {
    const { run, registered } = makeCtx({ rows: TWO_ROWS, links: ['d1', 'd2'] });
    const byDate = await run({ action: 'rank', by: 'date' });
    expect(byDate.ranking).toEqual([
      { rank: 1, sourceId: 'd2', title: 'Protokoll', value: '2026-09-10', unit: 'Datum' },
      { rank: 2, sourceId: 'd1', title: 'Antrag Radweg', value: '2026-09-01', unit: 'Datum' },
    ]);
    expect(byDate.refs).toBe(
      '1. Protokoll — d2 (2026-09-10 Datum)\n2. Antrag Radweg — d1 (2026-09-01 Datum)'
    );
    expect(registered).toHaveLength(1);
    const byLength = await run({ action: 'rank', by: 'length' });
    expect((byLength.ranking as Array<{ value: unknown }>).map((r) => r.value)).toEqual([
      9000, 7800,
    ]);
    const byPages = await run({ action: 'rank', by: 'pages', limit: 1 });
    expect(byPages.ranking).toEqual([
      { rank: 1, sourceId: 'd2', title: 'Protokoll', value: 9, unit: 'Seiten' },
    ]);
  });

  it('ranks by relevance through the document search, dropping weak hits', async () => {
    const { run, documentService } = makeCtx({
      links: ['d1', 'd2'],
      searchResults: [
        { document_id: 'd1', title: 'Antrag Radweg', similarity_score: 0.81, relevant_content: '' },
        { document_id: 'd2', title: 'Protokoll', similarity_score: 0.1, relevant_content: '' },
      ],
    });
    const out = await run({ action: 'rank', by: 'relevance', query: 'Radweg' });
    expect(out.ranking).toEqual([
      { rank: 1, sourceId: 'd1', title: 'Antrag Radweg', value: 0.81, unit: 'score' },
    ]);
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Radweg', filters: { documentIds: ['d1', 'd2'] } })
    );
  });

  it('ranks by term count and carries exhaustive', async () => {
    const { run } = makeCtx({ rows: TWO_ROWS, links: ['d1', 'd2'], markdownById: TWO_TEXTS });
    const out = await run({ action: 'rank', by: 'term', query: 'Radweg' });
    expect(out).toMatchObject({ by: 'term', query: 'Radweg', exhaustive: true });
    expect(out.ranking).toEqual([
      { rank: 1, sourceId: 'd1', title: 'Antrag Radweg', value: 2, unit: 'Treffer' },
      { rank: 2, sourceId: 'd2', title: 'Protokoll', value: 1, unit: 'Treffer' },
    ]);
  });

  it('needs by, and a query for relevance and term', async () => {
    const { run } = makeCtx();
    expect((await run({ action: 'rank' })).error).toMatch(/by/);
    expect((await run({ action: 'rank', by: 'term' })).error).toBe(
      'rank by="term" braucht query (mindestens 2 Zeichen).'
    );
    expect((await run({ action: 'rank', by: 'term', query: 'a' })).error).toBe(
      'rank by="term" braucht query (mindestens 2 Zeichen).'
    );
    expect((await run({ action: 'rank', by: 'relevance' })).error).toBe(
      'rank by="relevance" braucht query.'
    );
  });
});

describe('cite', () => {
  it('locates a quote and grounds the exact span with its locator', async () => {
    const { run, registered } = makeCtx();
    const out = await run({ action: 'cite', zitat: 'Der Radweg kommt 2027' });
    expect(out).toMatchObject({
      found: true,
      method: 'exact',
      sourceId: 'd1',
      title: 'Antrag Radweg',
      charStart: 24,
      charEnd: 45,
      pageNumber: 2,
      chunkIndex: 1,
      exhaustive: true,
    });
    expect(registered[0]!.results[0]).toMatchObject({
      documentId: 'd1',
      collectionId: 'n1',
      charStart: 24,
      charEnd: 45,
      pageNumber: 2,
      chunkIndex: 1,
      citedText: 'Der Radweg kommt 2027',
    });
  });

  it('says a missing quote is missing only as far as it looked', async () => {
    const { run, notes } = makeCtx();
    const out = await run({ action: 'cite', zitat: 'Der Mond ist aus Käse' });
    expect(out).toMatchObject({ found: false, exhaustive: true, candidates: [] });
    expect(notes[0]?.[1]).toBe('Das Zitat „Der Mond ist aus Käse" steht so in keiner Quelle.');
  });

  it('takes exactly one of zitat and claim', async () => {
    const { run } = makeCtx();
    const msg = 'cite braucht genau eines: zitat oder claim.';
    expect((await run({ action: 'cite' })).error).toBe(msg);
    expect(
      (await run({ action: 'cite', zitat: 'Der Radweg kommt', claim: 'Radweg kommt bald' })).error
    ).toBe(msg);
  });

  it('finds sentences that may support a claim', async () => {
    const { run, registered } = makeCtx({
      searchResults: [
        {
          document_id: 'd1',
          title: 'Antrag Radweg',
          similarity_score: 0.8,
          top_chunks: [
            {
              chunk_index: 1,
              page_number: 2,
              preview: '',
              text: 'Der Radweg kommt 2027.',
              char_start: 24,
              char_end: 46,
            },
          ],
        },
      ],
    });
    const out = await run({ action: 'cite', claim: 'Der Radweg kommt schon 2027' });
    expect(out.candidates).toEqual([
      {
        sourceId: 'd1',
        title: 'Antrag Radweg',
        sentence: 'Der Radweg kommt 2027.',
        charStart: 24,
        charEnd: 46,
        pageNumber: 2,
        chunkIndex: 1,
        score: 0.75,
      },
    ]);
    expect(registered[0]!.results[0]).toMatchObject({ citedText: 'Der Radweg kommt 2027.' });
  });
});

/**
 * Ein ausgefallener Dienst darf nie wie ein leerer Befund aussehen: sonst sagt
 * das Modell „dazu steht nichts im Notebook", obwohl nur Qdrant weg war.
 */
describe('Ausfälle sind keine Leermeldungen', () => {
  it('find: a failed search is an error, not "keine Passage gefunden"', async () => {
    const { run, notes, registered } = makeCtx({ searchError: 'embedding service down' });
    const out = await run({ action: 'find', query: 'Radweg' });
    expect(out.error).toMatch(/fehlgeschlagen/);
    expect(out).not.toHaveProperty('resultCount');
    expect(notes).toEqual([]);
    expect(registered).toEqual([]);
  });

  it('read: a failed chunk read is an error, not "keine Seitenzahlen"', async () => {
    const { run, notes } = makeCtx({ chunkError: 'Qdrant not available' });
    const out = await run({ action: 'read', sourceId: 'd1', seite: 2 });
    expect(out.error).toBe(
      'Die Quelle ließ sich gerade nicht lesen — bitte später erneut versuchen.'
    );
    expect(notes).toEqual([]);
  });

  it('outline: a failed chunk read is an error, not "keine Gliederung"', async () => {
    const { run, notes, registered } = makeCtx({ chunkError: 'Qdrant not available' });
    const out = await run({ action: 'outline', sourceId: 'd1' });
    expect(out.error).toMatch(/nicht, dass die Quelle keine hat/);
    expect(notes).toEqual([]);
    expect(registered).toEqual([]);
  });

  it('grep, stats and cite: a failed read is an error, not "keine Treffer"', async () => {
    const { run, notes, registered } = makeCtx({ chunkError: 'Qdrant not available' });
    const expected = {
      grep: 'Die Zählung ist fehlgeschlagen — das heißt nicht, dass der Begriff nicht vorkommt.',
      stats: 'Die Statistik ließ sich gerade nicht berechnen — bitte später erneut versuchen.',
      cite: 'Die Zitatprüfung ist fehlgeschlagen — das heißt nicht, dass das Zitat nicht in den Quellen steht.',
    };
    expect((await run({ action: 'grep', phrase: 'Radweg' })).error).toBe(expected.grep);
    expect((await run({ action: 'stats' })).error).toBe(expected.stats);
    expect((await run({ action: 'cite', zitat: 'Der Radweg kommt' })).error).toBe(expected.cite);
    expect(notes).toEqual([]);
    expect(registered).toEqual([]);
  });

  it('rank and cite: a failed search is an error, not an empty ranking', async () => {
    const { run, notes, registered } = makeCtx({ searchError: 'embedding service down' });
    const rank = await run({ action: 'rank', by: 'relevance', query: 'Radweg' });
    expect(rank.error).toBe(
      'Die Rangfolge ließ sich gerade nicht bilden — bitte später erneut versuchen.'
    );
    expect(rank).not.toHaveProperty('ranking');
    const claim = await run({ action: 'cite', claim: 'Der Radweg kommt 2027' });
    expect(claim.error).toMatch(/Zitatprüfung ist fehlgeschlagen/);
    expect(notes).toEqual([]);
    expect(registered).toEqual([]);
  });

  it('keeps raw internal error text away from the model', async () => {
    const { run } = makeCtx({ linksThrow: 'Too many document IDs' });
    for (const action of ['list', 'find'] as const) {
      const out = await run({ action, query: 'Radweg' });
      expect(typeof out.error).toBe('string');
      expect(JSON.stringify(out)).not.toContain('Too many document IDs');
    }
  });
});

describe('leeres Notebook', () => {
  it('find on an empty notebook finds nothing and never searches the personal library', async () => {
    const { run, notes, documentService } = makeCtx({ links: [] });
    const out = await run({ action: 'find', query: 'Radweg' });
    expect(out).toMatchObject({ resultCount: 0, passages: [] });
    expect(documentService.search).not.toHaveBeenCalled();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.[1]).toMatch(/Keine Passage/);
  });
});

describe('was der Schreiber im split-Modus sieht', () => {
  it('puts a read slice into the citable sources with its locator', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'read', sourceId: 'd1', seite: 2 });
    expect(registry.freshSize).toBe(1);
    expect(registry.renderAll()).toContain('Der Radweg kommt 2027.');
    const [citation] = registry.getCitations();
    expect(citation).toMatchObject({
      documentId: 'd1',
      pageNumber: 2,
      citedText: 'Der Radweg kommt 2027.',
    });
  });

  it('keeps two passages from the same source as two sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({
      registry,
      searchResults: [
        {
          document_id: 'd1',
          title: 'Antrag Radweg',
          similarity_score: 0.8,
          top_chunks: [
            {
              chunk_index: 1,
              page_number: 2,
              preview: '',
              text: 'Der Radweg kommt 2027.',
              char_start: 24,
              char_end: 46,
            },
            {
              chunk_index: 2,
              page_number: 3,
              preview: '',
              text: 'Anhang mit Zahlen.',
              char_start: 48,
              char_end: 66,
            },
          ],
        },
      ],
    });
    await run({ action: 'find', query: 'Radweg' });
    expect(registry.freshSize).toBe(2);
    expect(registry.getCitations().map((c) => c.pageNumber)).toEqual([2, 3]);
  });

  it('puts the source rows into the sources and only the counts into VORGÄNGE', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'list' });
    expect(registry.freshSize).toBe(1);
    const [sources, vorgaenge = ''] = registry.renderAll().split('VORGÄNGE IN DIESEM TURN');
    expect(sources).toContain('Antrag Radweg');
    expect(vorgaenge).toContain('total: 1');
    expect(vorgaenge).not.toContain('Antrag Radweg');
  });

  it('keeps an empty find in VORGÄNGE and out of the sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry, searchResults: [] });
    await run({ action: 'find', query: 'Mond' });
    expect(registry.freshSize).toBe(0);
    expect(registry.renderAll()).toContain('VORGÄNGE IN DIESEM TURN');
  });
});
