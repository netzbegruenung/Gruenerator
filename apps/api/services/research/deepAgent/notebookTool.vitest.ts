import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two things are worth guarding here, and they are not the happy path.
 *
 * First, the budget: a notebook search costs a Qdrant query, and if it drew on
 * the same counter as the paid web searches, an agent that likes notebooks would
 * quietly starve itself of the expensive lane it actually needs.
 *
 * Second, sources without a URL. Personal notebook documents usually have none,
 * and the source ledger used to be keyed by URL — every such document would
 * collapse into one entry, and the report would cite a single phantom source for
 * everything it read.
 */

// Typed returns rather than bare `vi.fn()`: these forward straight into the
// module under test, and an `any` there is an unsafe return the type-aware rules
// reject.
const executeDirectSearch = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const documentSearch = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../../routes/chat/agents/directSearchExecutors.js', () => ({
  executeDirectSearch: (...args: unknown[]) => executeDirectSearch(...args),
}));
vi.mock('../../document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () => ({ search: (...args: unknown[]) => documentSearch(...args) }),
}));

const { createNotebookTool } = await import('./notebookTool.js');
const { createBudget, DEFAULT_BUDGET } = await import('./types.js');

interface RunnableTool {
  name: string;
  invoke: (input: unknown) => Promise<string>;
}

const CORPORA = [
  {
    id: 'berlin-notebook',
    title: 'Berlin',
    description: 'Grüne Berlin',
    collections: ['berlin'],
  },
  {
    id: 'gruenerator-notebook',
    title: 'Grünerator',
    description: 'Mehrere Quellen',
    collections: ['deutschland', 'gruene-de'],
  },
];

function hit(overrides: Record<string, unknown> = {}) {
  return {
    rank: 1,
    relevance: 'hoch',
    source: 'Wahlprogramm 2026',
    url: 'https://gruene.de/programm',
    excerpt: 'Wir wollen mehr bezahlbaren Wohnraum.',
    searchMethod: 'hybrid',
    documentId: 'doc-1',
    ...overrides,
  };
}

function setup(
  scopeOverrides: Partial<{
    corpora: typeof CORPORA;
    mentionedCollections: string[];
    documentIds: string[];
  }> = {},
  budgetOverrides: { softDeadlineAt?: number; notebookSearchesLeft?: number } = {}
) {
  const ctx = {
    budget: { ...createBudget(Date.now()), ...budgetOverrides },
    locale: 'de-DE' as const,
    sources: new Map<string, { url: string; title: string; origin?: string }>(),
    onStep: vi.fn(),
  };
  const scope = {
    corpora: CORPORA,
    mentionedCollections: [],
    documentIds: [],
    userId: 'user-1',
    ...scopeOverrides,
  };
  const tool = createNotebookTool(ctx, scope) as unknown as RunnableTool;
  return { ctx, tool };
}

beforeEach(() => {
  vi.clearAllMocks();
  executeDirectSearch.mockResolvedValue({
    collection: 'deutschland',
    query: 'q',
    searchMode: 'hybrid',
    resultsCount: 1,
    results: [hit()],
  });
  documentSearch.mockResolvedValue({ results: [] });
});

describe('Sammlungswahl', () => {
  it('sucht ohne Angabe die Locale-Standardsammlungen', async () => {
    const { tool } = setup();

    await tool.invoke({ frage: 'Mietpreisbremse' });

    const searched = executeDirectSearch.mock.calls.map(
      (c) => (c[0] as { collection: string }).collection
    );
    expect(searched).toEqual(['deutschland', 'bundestagsfraktion', 'gruene-de']);
  });

  it('sucht österreichisch, wenn die Frage aus Österreich kommt', async () => {
    const { ctx, tool } = setup();
    ctx.locale = 'de-AT' as never;

    await tool.invoke({ frage: 'Mietpreisbremse' });

    const searched = executeDirectSearch.mock.calls.map(
      (c) => (c[0] as { collection: string }).collection
    );
    expect(searched).toEqual(['oesterreich', 'gruene-at']);
  });

  it('folgt einem ausdrücklich genannten Notizbuch', async () => {
    const { tool } = setup();

    await tool.invoke({ frage: 'Mietpreisbremse', notizbuch: 'berlin-notebook' });

    expect(executeDirectSearch).toHaveBeenCalledOnce();
    expect((executeDirectSearch.mock.calls[0][0] as { collection: string }).collection).toBe(
      'berlin'
    );
  });

  it('zieht die Auswahl des Turns den Standards vor', async () => {
    const { tool } = setup({ mentionedCollections: ['hamburg'] });

    await tool.invoke({ frage: 'Mietpreisbremse' });

    const searched = executeDirectSearch.mock.calls.map(
      (c) => (c[0] as { collection: string }).collection
    );
    expect(searched).toEqual(['hamburg']);
  });

  /**
   * Das `enum` im Schema ist die eigentliche Absicherung: ein erfundener Name
   * erreicht den Handler gar nicht erst. Das ist der Grund, warum die Liste im
   * Schema steht und nicht im Prompt.
   */
  it('lässt ein erfundenes Notizbuch nicht bis zur Suche durch', async () => {
    const { ctx, tool } = setup();

    await expect(tool.invoke({ frage: 'x', notizbuch: 'atlantis-notebook' })).rejects.toThrow();

    expect(executeDirectSearch).not.toHaveBeenCalled();
    expect(ctx.budget.notebookSearchesLeft).toBe(DEFAULT_BUDGET.notebookSearches);
  });
});

describe('Budget', () => {
  it('verbraucht das eigene Budget und nicht das der Websuche', async () => {
    const { ctx, tool } = setup();

    await tool.invoke({ frage: 'Mietpreisbremse' });

    expect(ctx.budget.notebookSearchesLeft).toBe(DEFAULT_BUDGET.notebookSearches - 1);
    expect(ctx.budget.searchesLeft).toBe(DEFAULT_BUDGET.searches);
  });

  it('verweigert, wenn das Notizbuchbudget aufgebraucht ist', async () => {
    const { tool } = setup({}, { notebookSearchesLeft: 0 });

    const out = await tool.invoke({ frage: 'Mietpreisbremse' });

    expect(out).toContain('aufgebraucht');
    expect(executeDirectSearch).not.toHaveBeenCalled();
  });

  it('verweigert nach der weichen Deadline, ohne Budget zu buchen', async () => {
    const { ctx, tool } = setup({}, { softDeadlineAt: Date.now() - 1000 });

    const out = await tool.invoke({ frage: 'Mietpreisbremse' });

    expect(out).toContain('Zeitbudget');
    expect(ctx.budget.notebookSearchesLeft).toBe(DEFAULT_BUDGET.notebookSearches);
  });
});

describe('Ausfälle', () => {
  it('liefert Prosa statt zu werfen, wenn eine Sammlung ausfällt', async () => {
    executeDirectSearch.mockRejectedValue(new Error('qdrant weg'));
    const { ctx, tool } = setup();

    const out = await tool.invoke({ frage: 'Mietpreisbremse' });

    expect(out).toContain('Keine Treffer');
    expect(ctx.onStep).toHaveBeenLastCalledWith(expect.any(String), 'done');
  });

  it('meldet Beginn und Ende unter demselben Label — es ist die Schritt-Identität', async () => {
    const { ctx, tool } = setup();

    await tool.invoke({ frage: 'Mietpreisbremse' });

    const labels = ctx.onStep.mock.calls.map((c) => c[0]);
    expect(labels[0]).toBe(labels[1]);
    expect(ctx.onStep.mock.calls.map((c) => c[1])).toEqual(['running', 'done']);
  });
});

describe('eigene Notizbücher', () => {
  it('bleibt aus, solange keine Dokumente im Zugriff sind', async () => {
    const { tool } = setup();

    await tool.invoke({ frage: 'Mietpreisbremse' });

    expect(documentSearch).not.toHaveBeenCalled();
  });

  it('sucht die freigegebenen Dokumente mit, ohne sie selbst aufzulösen', async () => {
    documentSearch.mockResolvedValue({
      results: [
        { document_id: 'd1', title: 'Notiz A', relevant_content: 'Text A', source_url: null },
      ],
    });
    const { tool } = setup({ documentIds: ['d1', 'd2'] });

    const out = await tool.invoke({ frage: 'Mietpreisbremse' });

    expect(documentSearch).toHaveBeenCalledOnce();
    expect(documentSearch.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      filters: { documentIds: ['d1', 'd2'] },
    });
    expect(out).toContain('Notiz A');
  });

  it('führt URL-lose Treffer als eigene Quellen, statt sie zu verschmelzen', async () => {
    documentSearch.mockResolvedValue({
      results: [
        { document_id: 'd1', title: 'Notiz A', relevant_content: 'A', source_url: null },
        { document_id: 'd2', title: 'Notiz B', relevant_content: 'B', source_url: null },
      ],
    });
    const { ctx, tool } = setup({ documentIds: ['d1', 'd2'] });

    await tool.invoke({ frage: 'Mietpreisbremse' });

    const titles = [...ctx.sources.values()].map((s) => s.title);
    expect(titles).toContain('Notiz A');
    expect(titles).toContain('Notiz B');
    expect(ctx.sources.get('notizbuch:d1')?.origin).toBe('Eigenes Notizbuch');
  });

  it('weist die Herkunft aus, wenn ein Treffer keine Adresse hat', async () => {
    executeDirectSearch.mockResolvedValue({
      collection: 'berlin',
      query: 'q',
      searchMode: 'hybrid',
      resultsCount: 1,
      results: [hit({ url: undefined, documentId: 'b1' })],
    });
    const { ctx, tool } = setup();

    const out = await tool.invoke({ frage: 'x', notizbuch: 'berlin-notebook' });

    expect(out).toContain('Notizbuch: Berlin');
    expect(ctx.sources.get('notizbuch:b1')?.origin).toBe('Notizbuch: Berlin');
  });
});
