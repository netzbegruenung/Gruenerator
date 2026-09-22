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
    getCollectionDocuments: vi.fn(async () =>
      (opts.links ?? ['d1']).map((document_id) => ({ document_id, added_at: '', added_by: null }))
    ),
    isDocumentInCollection: vi.fn(async () => opts.inCollection ?? true),
  };
  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('markdown_content FROM documents')) {
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
    getDocumentChunks: vi.fn(async () => ({
      success: true,
      chunks: opts.chunks ?? CHUNKS,
      chunkCount: (opts.chunks ?? CHUNKS).length,
    })),
    search: vi.fn(async () => ({
      success: true,
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
    expect(READ_ACTIONS).toEqual(['list', 'outline', 'read', 'find']);
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

  it('refuses system collections with the gruenerator_search hint', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'list', notebookId: 'grundsatz-system' });
    expect(out.error).toBe(
      'System-Notebooks werden von notebook_quellen noch nicht unterstützt — nutze gruenerator_search mit collection="deutschland".'
    );
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

  it('puts the source list into the sources, not into VORGÄNGE', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry });
    await run({ action: 'list' });
    expect(registry.freshSize).toBe(1);
    expect(registry.renderAll()).toContain('Antrag Radweg');
    expect(registry.renderAll()).not.toContain('VORGÄNGE IN DIESEM TURN');
  });

  it('keeps an empty find in VORGÄNGE and out of the sources', async () => {
    const registry = createSourceRegistry();
    const { run } = makeCtx({ registry, searchResults: [] });
    await run({ action: 'find', query: 'Mond' });
    expect(registry.freshSize).toBe(0);
    expect(registry.renderAll()).toContain('VORGÄNGE IN DIESEM TURN');
  });
});
