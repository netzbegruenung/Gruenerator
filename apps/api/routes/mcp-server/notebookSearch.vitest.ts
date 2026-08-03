/**
 * The `notebooks` tool's `search` action is the only MCP path into a user's own
 * corpus. It shipped broken in two independent ways (see fix/mcp-notebook-search-empty),
 * and both are invisible from the outside because the bridge swallows the throw
 * into a generic error string. These tests pin the contract at the seam.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const askSingleCollection = vi.fn();
const getNotebookCollection = vi.fn();
const getCollectionDocuments = vi.fn();

vi.mock('../../services/notebook/NotebookQAService.js', () => ({
  notebookQAService: { askSingleCollection: (...a: unknown[]) => askSingleCollection(...a) },
}));

vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    getNotebookCollection = (...a: unknown[]) => getNotebookCollection(...a);
    getCollectionDocuments = (...a: unknown[]) => getCollectionDocuments(...a);
  },
}));

vi.mock('../../utils/getAIWorkerPool.js', () => ({
  getAIWorkerPool: () => ({ processRequest: vi.fn() }),
}));

vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById: vi.fn() }),
}));

vi.mock('../../services/monitor/UmfragenService.js', () => ({ lookupUmfragen: vi.fn() }));

vi.mock('../chat/agents/directSearchExecutors.js', () => ({
  executeDirectSearch: vi.fn(),
  executeDirectExamplesSearch: vi.fn(),
  executeDirectPressemitteilungExamples: vi.fn(),
}));

vi.mock('../chat/services/intentExecutionService.js', () => ({
  runBoardGeneration: vi.fn(),
  runDocGeneration: vi.fn(),
}));

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { buildAuthenticatedMcpServer } = await import('./serverFactory.js');

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

/**
 * Capture the handlers at registration. Spying on the prototype avoids reaching
 * into the SDK's private registry, whose shape is not ours to depend on.
 */
function notebooksTool(): { handler: Handler } {
  const tools = new Map<string, Handler>();
  const spy = vi.spyOn(McpServer.prototype, 'registerTool').mockImplementation(function (
    this: unknown,
    name: string,
    _config,
    cb
  ) {
    tools.set(name, cb as Handler);
    return {} as never;
  });
  try {
    buildAuthenticatedMcpServer({
      userId: 'user-1',
      scopes: new Set(['content:read']),
      req: { app: { locals: {} } } as never,
    });
  } finally {
    spy.mockRestore();
  }
  const handler = tools.get('notebooks');
  if (!handler) {
    throw new Error(`notebooks tool not registered; got: ${[...tools.keys()].join(', ')}`);
  }
  return { handler };
}

const COLLECTION = { id: 'nb-1', name: 'Mein Notizbuch', user_id: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  getNotebookCollection.mockResolvedValue(COLLECTION);
  getCollectionDocuments.mockResolvedValue([{ document_id: 'doc-1' }]);
});

describe('notebooks.search over MCP', () => {
  it('passes the collection resolvers the service requires for user notebooks', async () => {
    // Without these two the service throws before any search happens — the
    // original defect. Asserting on the call is what keeps it fixed.
    askSingleCollection.mockResolvedValue({ success: true, answer: 'Antwort.', citations: [] });

    await notebooksTool().handler({ action: 'search', id: 'nb-1', query: 'Klima' });

    expect(askSingleCollection).toHaveBeenCalledTimes(1);
    const params = askSingleCollection.mock.calls[0][0];
    expect(typeof params.getCollectionFn).toBe('function');
    expect(typeof params.getDocumentIdsFn).toBe('function');
    await expect(params.getCollectionFn('nb-1')).resolves.toEqual(COLLECTION);
    await expect(params.getDocumentIdsFn('nb-1')).resolves.toEqual(['doc-1']);
  });

  it('does not request fastMode — it is the branch that drops every citation', async () => {
    askSingleCollection.mockResolvedValue({ success: true, answer: 'Antwort.', citations: [] });

    await notebooksTool().handler({ action: 'search', id: 'nb-1', query: 'Klima' });

    expect(askSingleCollection.mock.calls[0][0].fastMode).toBeFalsy();
  });

  it('returns the answer together with its numbered sources', async () => {
    askSingleCollection.mockResolvedValue({
      success: true,
      answer: 'Die Quellen nennen Radwege.[1] Und Tempo 30.[2]',
      citations: [
        { index: '1', document_title: 'Verkehrskonzept', source_url: 'https://example.org/a' },
        { index: '2', title: 'Beschluss', url: '/document/b' },
      ],
    });

    const res = await notebooksTool().handler({ action: 'search', id: 'nb-1', query: 'Verkehr' });
    const text = res.content[0].text;

    expect(text).toContain('Die Quellen nennen Radwege.[1]');
    expect(text).toContain('[1] Verkehrskonzept — https://example.org/a');
    expect(text).toContain('[2] Beschluss —');
    expect(text).toContain('Mein Notizbuch');
    expect(res.isError).toBeUndefined();
  });

  it('returns the plain answer when a search legitimately finds nothing', async () => {
    askSingleCollection.mockResolvedValue({
      success: true,
      answer: 'Die Dokumente werden gerade indexiert (1/3 bereit).',
      citations: [],
    });

    const res = await notebooksTool().handler({ action: 'search', id: 'nb-1', query: 'Klima' });
    expect(res.content[0].text).toBe('Die Dokumente werden gerade indexiert (1/3 bereit).');
    expect(res.isError).toBeUndefined();
  });

  it('translates the service access error instead of leaking the generic bridge text', async () => {
    askSingleCollection.mockRejectedValue(new Error('Collection not found or access denied'));

    const res = await notebooksTool().handler({ action: 'search', id: 'nb-1', query: 'Klima' });
    expect(res.content[0].text).toBe('Notizbuch nicht gefunden oder kein Zugriff.');
    expect(res.isError).toBe(true);
  });

  it('reports an empty notebook as such', async () => {
    askSingleCollection.mockRejectedValue(new Error('No documents found in this collection'));

    const res = await notebooksTool().handler({ action: 'search', id: 'nb-1', query: 'Klima' });
    expect(res.content[0].text).toBe('Dieses Notizbuch enthält noch keine Dokumente.');
  });

  it('leaves the access decision to the service rather than an owner-only check', async () => {
    // A notebook shared with the user (share_mode='authenticated') is readable
    // in the web app; the MCP path must not be stricter.
    getNotebookCollection.mockResolvedValue({ ...COLLECTION, user_id: 'someone-else' });
    askSingleCollection.mockResolvedValue({ success: true, answer: 'Geteilt.', citations: [] });

    const res = await notebooksTool().handler({ action: 'search', id: 'nb-1', query: 'Klima' });

    expect(askSingleCollection).toHaveBeenCalledTimes(1);
    expect(res.content[0].text).toBe('Geteilt.');
  });

  it('still rejects a notebook that does not exist', async () => {
    getNotebookCollection.mockResolvedValue(null);

    const res = await notebooksTool().handler({ action: 'search', id: 'nope', query: 'Klima' });
    expect(res.content[0].text).toBe('Notizbuch nicht gefunden oder kein Zugriff.');
    expect(askSingleCollection).not.toHaveBeenCalled();
  });

  it('demands both id and query', async () => {
    const res = await notebooksTool().handler({ action: 'search', id: 'nb-1', query: '  ' });
    expect(res.content[0].text).toContain('braucht id');
    expect(askSingleCollection).not.toHaveBeenCalled();
  });
});
