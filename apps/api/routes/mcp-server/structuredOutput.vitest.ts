/**
 * The declared `outputSchema` and what a tool actually returns must agree: once
 * a tool carries a schema, the SDK validates every SUCCESSFUL return against it
 * and turns a mismatch into `-32602 Output validation error`. The empty-result
 * branch is the one that gets forgotten, so it is tested first.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const executeDirectSearch = vi.fn();
const executeDirectExamplesSearch = vi.fn();
const executeDirectPressemitteilungExamples = vi.fn();

vi.mock('../chat/agents/directSearchExecutors.js', () => ({
  executeDirectSearch: (...a: unknown[]) => executeDirectSearch(...a),
  executeDirectExamplesSearch: (...a: unknown[]) => executeDirectExamplesSearch(...a),
  executeDirectPressemitteilungExamples: (...a: unknown[]) =>
    executeDirectPressemitteilungExamples(...a),
}));

vi.mock('../chat/agents/personalDataTools.js', () => ({
  makeBoardsTasksTool: () => ({}),
  makeDocumentsTool: () => ({}),
  makeFindContentTool: () => ({}),
  makeGroupsTool: () => ({}),
  makeMediaTool: () => ({}),
  makeNotebooksTool: () => ({}),
}));

vi.mock('../chat/services/intentExecutionService.js', () => ({
  runBoardGeneration: vi.fn(),
  runDocGeneration: vi.fn(),
}));

vi.mock('../../services/notebook/NotebookQAService.js', () => ({ notebookQAService: {} }));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('../../services/user/ProfileService.js', () => ({ getProfileService: () => ({}) }));
vi.mock('../../services/monitor/UmfragenService.js', () => ({ lookupUmfragen: vi.fn() }));
vi.mock('./mcpMutations.js', () => ({
  addCardDirect: vi.fn(),
  createGroupDirect: vi.fn(),
  joinGroupDirect: vi.fn(),
  shareDocToGroupMcp: vi.fn(),
}));
vi.mock('./chatToolBridge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chatToolBridge.js')>()),
  registerAiTool: vi.fn(),
}));

const computeMergedFilters = vi.fn();
vi.mock('../research/researchController.js', () => ({
  computeMergedFilters: (...a: unknown[]) => computeMergedFilters(...a),
  getCachedFilters: () => null,
  setCachedFilters: vi.fn(),
}));

const { buildAuthenticatedMcpServer, renderNotebookAnswer } = await import('./serverFactory.js');

type Handler = (args: Record<string, unknown>) => Promise<{
  structuredContent?: Record<string, unknown>;
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface Registered {
  outputSchema?: z.ZodRawShape;
}

function buildTools() {
  const tools = new Map<string, { handler: Handler; config: Registered }>();
  const spy = vi.spyOn(McpServer.prototype, 'registerTool').mockImplementation(function (
    this: unknown,
    name: string,
    config: Registered,
    cb: unknown
  ) {
    tools.set(name, { handler: cb as Handler, config });
    return {} as never;
  });
  buildAuthenticatedMcpServer({
    userId: 'user-1',
    scopes: new Set(['search']),
    req: {} as never,
  });
  spy.mockRestore();
  return tools;
}

/** What the SDK does before it lets a result out: normalizeObjectSchema + parse. */
async function callAndValidate(name: string, args: Record<string, unknown>) {
  const entry = buildTools().get(name);
  if (!entry) throw new Error(`${name} nicht registriert`);
  const result = await entry.handler(args);
  if (result.isError) return result;
  const shape = entry.config.outputSchema;
  if (!shape) throw new Error(`${name} hat kein outputSchema`);
  expect(result.structuredContent, `${name} liefert kein structuredContent`).toBeDefined();
  const parsed = z.object(shape).safeParse(result.structuredContent);
  if (!parsed.success) {
    throw new Error(`structuredContent verletzt das outputSchema: ${parsed.error.message}`);
  }
  return result;
}

beforeEach(() => {
  executeDirectSearch.mockReset();
  executeDirectExamplesSearch.mockReset();
  executeDirectPressemitteilungExamples.mockReset();
  computeMergedFilters.mockReset();
});

describe('gruenerator_search', () => {
  it('erfüllt das Schema und gibt jedem Treffer ein ref', async () => {
    executeDirectSearch.mockResolvedValue({
      resultsCount: 1,
      results: [
        {
          rank: 1,
          relevance: '92%',
          source: 'Grundsatzprogramm',
          url: 'https://gruene.de/programm',
          excerpt: 'Auszug.',
          searchMethod: 'hybrid',
          documentId: 'doc-1',
        },
      ],
    });
    const result = await callAndValidate('gruenerator_search', {
      query: 'Klima',
      collection: 'deutschland',
      limit: 5,
    });
    const hit = (result.structuredContent as { results: Array<{ ref: string }> }).results[0];
    expect(hit?.ref).toBeTruthy();
    expect(result.content[0]?.text).toContain('[ref:');
  });

  it('liefert auch ohne Treffer structuredContent — sonst kippt die Antwort in -32602', async () => {
    executeDirectSearch.mockResolvedValue({ resultsCount: 0, results: [] });
    const result = await callAndValidate('gruenerator_search', {
      query: 'Klima',
      collection: 'deutschland',
      limit: 5,
    });
    expect(result.structuredContent).toMatchObject({ resultsCount: 0, results: [] });
    expect(result.content[0]?.text).toBe('Keine Treffer.');
  });

  it('hält ref über zwei Aufrufe hinweg stabil, obwohl rank sich ändert', async () => {
    const url = 'https://gruene.de/programm';
    executeDirectSearch.mockResolvedValue({
      resultsCount: 1,
      results: [{ rank: 1, relevance: '92%', source: 'A', url, excerpt: 'x' }],
    });
    const first = await callAndValidate('gruenerator_search', {
      query: 'a',
      collection: 'deutschland',
      limit: 5,
    });

    executeDirectSearch.mockResolvedValue({
      resultsCount: 2,
      results: [
        { rank: 1, relevance: '95%', source: 'B', url: 'https://gruene.de/anderes', excerpt: 'y' },
        { rank: 2, relevance: '80%', source: 'A', url, excerpt: 'x' },
      ],
    });
    const second = await callAndValidate('gruenerator_search', {
      query: 'b',
      collection: 'deutschland',
      limit: 5,
    });

    const before = (first.structuredContent as { results: Array<{ ref: string; rank: number }> })
      .results[0];
    const after = (second.structuredContent as { results: Array<{ ref: string; rank: number }> })
      .results[1];
    expect(after?.ref).toBe(before?.ref);
    expect(before?.rank).toBe(1);
    expect(after?.rank).toBe(2);
  });

  it('bleibt im Fehlerfall ohne structuredContent — dort prüft das SDK nicht', async () => {
    executeDirectSearch.mockResolvedValue({ error: true, message: 'Index nicht erreichbar.' });
    const result = await callAndValidate('gruenerator_search', {
      query: 'Klima',
      collection: 'deutschland',
      limit: 5,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe('gruenerator_examples_search', () => {
  it('erfüllt das Schema bei Social-Beispielen', async () => {
    executeDirectExamplesSearch.mockResolvedValue({
      resultsCount: 1,
      examples: [{ id: 'p1', platform: 'instagram', content: 'Post', url: 'https://insta/p/1' }],
    });
    const result = await callAndValidate('gruenerator_examples_search', {
      type: 'social',
      query: 'Klima',
      country: 'DE',
      limit: 6,
    });
    const examples = (result.structuredContent as { examples: Array<{ ref: string }> }).examples;
    expect(examples[0]?.ref).toBeTruthy();
  });

  it('erfüllt das Schema bei Pressemitteilungen', async () => {
    executeDirectPressemitteilungExamples.mockResolvedValue({
      resultsCount: 1,
      examples: [{ id: 'pm1', title: 'PM', body: 'Text', lv: 'HH' }],
    });
    await callAndValidate('gruenerator_examples_search', {
      type: 'pressemitteilung',
      query: 'Klima',
      country: 'DE',
      limit: 6,
    });
  });
});

describe('gruenerator_get_filters', () => {
  it('erfüllt das Schema und trägt die volle Werteliste, nicht die gekürzte Prosa', async () => {
    const values = Array.from({ length: 30 }, (_, i) => ({ value: `v${i}`, count: 30 - i }));
    computeMergedFilters.mockResolvedValue({
      filters: {
        content_type: { label: 'Inhaltstyp', type: 'keyword', values },
        published: { label: 'Datum', type: 'date_range', min: '2020-01-01', max: '2026-01-01' },
      },
    });
    const result = await callAndValidate('gruenerator_get_filters', { collection: 'deutschland' });
    const fields = (result.structuredContent as { fields: Array<{ values?: unknown[] }> }).fields;
    expect(fields).toHaveLength(2);
    expect(fields[0]?.values).toHaveLength(30);
    expect(result.content[0]?.text).toContain('Inhaltstyp');
  });

  it('liefert auch ohne Filterfelder structuredContent — sonst kippt die Antwort in -32602', async () => {
    computeMergedFilters.mockResolvedValue({ filters: {} });
    const result = await callAndValidate('gruenerator_get_filters', { collection: 'deutschland' });
    expect(result.structuredContent).toMatchObject({ fields: [] });
    expect(result.isError).toBeUndefined();
  });
});

/**
 * `notebooks` carries no `outputSchema` on purpose — it returns a finished cited
 * answer, not material, and a schema would force `list`/`rename`/`delete` and the
 * confirmation prompt into a common envelope. The `ref` therefore travels in the
 * prose, and that is what these assert.
 */
describe('renderNotebookAnswer', () => {
  const answer = 'Die Antwort [1].';

  it('hängt jeder Quellenzeile ein ref an', () => {
    const out = renderNotebookAnswer(
      {
        answer,
        citations: [
          { index: '1', document_title: 'Papier', source_url: '/docs/a', document_id: 'doc-a' },
        ],
      } as never,
      'Mein Notizbuch'
    );
    expect(out).toMatch(/\[1\] Papier — \S+\/docs\/a \[ref: [a-z0-9]+\]/);
  });

  it('hält das ref über zwei Antworten stabil, obwohl [n] sich dreht', () => {
    const cite = (index: string) => ({
      index,
      document_title: 'Papier',
      source_url: '/docs/a',
      document_id: 'doc-a',
    });
    const first = renderNotebookAnswer({ answer, citations: [cite('1')] } as never, 'NB');
    const second = renderNotebookAnswer(
      {
        answer,
        citations: [
          { index: '1', document_title: 'Anderes', source_url: '/docs/b', document_id: 'doc-b' },
          cite('2'),
        ],
      } as never,
      'NB'
    );
    const ref = /\[ref: ([a-z0-9]+)\]/.exec(first)?.[1];
    expect(ref).toBeTruthy();
    expect(second).toContain(`[2] Papier — `);
    expect(second.split('\n').find((l) => l.startsWith('[2]'))).toContain(`[ref: ${ref}]`);
  });

  it('fällt ohne source_url auf document_id zurück statt das ref wegzulassen', () => {
    const out = renderNotebookAnswer(
      {
        answer,
        citations: [{ index: '1', document_title: 'Upload', document_id: 'doc-c' }],
      } as never,
      'NB'
    );
    expect(out).toMatch(/\[ref: [a-z0-9]+\]/);
  });
});
