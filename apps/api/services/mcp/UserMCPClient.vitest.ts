import { describe, it, expect, vi } from 'vitest';

import { UserMCPClient, type McpConnectionConfig } from './UserMCPClient.js';

// The server URL is user-provided (custom MCP servers), so connect() must refuse
// internal/metadata targets before opening a transport (SSRF guard).
describe('UserMCPClient SSRF guard', () => {
  it('refuses localhost', async () => {
    const client = new UserMCPClient({
      id: '1',
      name: 'evil',
      url: 'http://localhost:5432/mcp',
      authType: 'none',
    });
    await expect(client.connect()).rejects.toThrow(/Unsichere MCP-Server-URL/);
  });

  it('refuses the cloud metadata endpoint', async () => {
    const client = new UserMCPClient({
      id: '2',
      name: 'meta',
      url: 'http://169.254.169.254/latest/meta-data',
      authType: 'none',
    });
    await expect(client.connect()).rejects.toThrow(/Unsichere MCP-Server-URL/);
  });
});

describe('UserMCPClient auth guard', () => {
  it.each(['bearer', 'oauth'] as const)(
    'refuses to connect anonymously when a %s server has no token',
    async (authType) => {
      const client = new UserMCPClient({
        id: '3',
        name: 'Notion',
        url: 'https://example.invalid/mcp',
        authType,
        token: null,
      });
      // Silently dropping the header made an expired OAuth session look like a
      // server with no tools.
      await expect(client.connect()).rejects.toThrow(/kein gültiger Zugang/);
    }
  );
});

/** Inject a stand-in for the connected SDK client so listTools can be driven. */
function withResponses(config: Partial<McpConnectionConfig>, pages: unknown[]): UserMCPClient {
  const client = new UserMCPClient({
    id: 'x',
    name: 'Test',
    url: 'https://example.invalid/mcp',
    authType: 'none',
    ...config,
  });
  const queue = [...pages];
  (client as unknown as { client: { request: () => Promise<unknown> } }).client = {
    request: () => Promise.resolve(queue.shift() ?? { tools: [] }),
  };
  return client;
}

describe('UserMCPClient.listTools tolerance', () => {
  it('keeps tools the SDK schema would reject', async () => {
    // Both of these make the SDK's strict ListToolsResultSchema reject the WHOLE
    // response — and with it every valid tool on the server.
    const client = withResponses({}, [
      {
        tools: [
          { name: 'kein_schema', description: 'ohne inputSchema' },
          { name: 'falscher_typ', inputSchema: { type: 'Object', properties: { a: {} } } },
          {
            name: 'sauber',
            description: 'ok',
            inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
          },
        ],
      },
    ]);

    const tools = await client.listTools();

    expect(tools.map((t) => t.name)).toEqual(['kein_schema', 'falscher_typ', 'sauber']);
    expect(tools[0]?.inputSchema).toEqual({ type: 'object', properties: {} });
    // The mistyped root is repaired, the declared properties survive.
    expect(tools[1]?.inputSchema).toEqual({ type: 'object', properties: { a: {} } });
    expect(tools[2]?.inputSchema).toMatchObject({ required: ['q'] });
    expect(client.skippedTools).toBe(0);
  });

  it('drops only entries without a usable name and counts them', async () => {
    const client = withResponses({}, [
      { tools: [{ description: 'namenlos' }, { name: '   ' }, { name: 'gut' }] },
    ]);

    const tools = await client.listTools();

    expect(tools.map((t) => t.name)).toEqual(['gut']);
    expect(client.skippedTools).toBe(2);
  });

  it('follows nextCursor across pages', async () => {
    const client = withResponses({}, [
      { tools: [{ name: 'eins' }], nextCursor: 'c1' },
      { tools: [{ name: 'zwei' }] },
    ]);

    const tools = await client.listTools();

    expect(tools.map((t) => t.name)).toEqual(['eins', 'zwei']);
  });

  it('carries outputSchema and _meta through (MCP-Apps widgets need them)', async () => {
    const client = withResponses({}, [
      {
        tools: [
          {
            name: 'widget',
            inputSchema: { type: 'object', properties: {} },
            outputSchema: { type: 'object', properties: { rows: {} } },
            _meta: { 'ui.resourceUri': 'ui://widget' },
          },
        ],
      },
    ]);

    const [tool] = await client.listTools();

    expect(tool?.outputSchema).toEqual({ type: 'object', properties: { rows: {} } });
    expect(tool?.meta).toEqual({ 'ui.resourceUri': 'ui://widget' });
  });

  it('carries annotations.readOnlyHint through, but only as a boolean', async () => {
    const client = withResponses({}, [
      {
        tools: [
          { name: 'reads', inputSchema: {}, annotations: { readOnlyHint: true } },
          { name: 'writes', inputSchema: {}, annotations: { readOnlyHint: false } },
          // Ein String ist kein Hinweis: der Server bekommt kein Mitspracherecht
          // ueber eine Wahrheitspruefung auf einem beliebigen Wert.
          { name: 'lies', inputSchema: {}, annotations: { readOnlyHint: 'true' } },
          { name: 'silent', inputSchema: {} },
        ],
      },
    ]);

    const byName = new Map((await client.listTools()).map((t) => [t.name, t]));

    expect(byName.get('reads')?.readOnlyHint).toBe(true);
    expect(byName.get('writes')?.readOnlyHint).toBe(false);
    // Fehlend, nicht `false`: „nichts gesagt" und „nein" duerfen sich nicht
    // vermischen — approvalPolicy behandelt nur `true` besonders.
    expect(byName.get('lies')).not.toHaveProperty('readOnlyHint');
    expect(byName.get('silent')).not.toHaveProperty('readOnlyHint');
  });

  it('survives a non-object entry in the tools array', async () => {
    // z.array(z.record(...)) hätte hier die ganze Seite verworfen — also genau
    // den Fehler wiederholt, gegen den das permissive Schema antritt.
    const client = withResponses({}, [{ tools: [null, 'kaputt', { name: 'gut' }] }]);

    const tools = await client.listTools();

    expect(tools.map((t) => t.name)).toEqual(['gut']);
    expect(client.skippedTools).toBe(2);
  });

  it('counts tools cut off by the cap instead of dropping them silently', async () => {
    const client = withResponses({}, [
      { tools: Array.from({ length: 505 }, (_, i) => ({ name: `t${i}` })) },
    ]);

    const tools = await client.listTools();

    expect(tools).toHaveLength(500);
    expect(client.truncatedTools).toBe(5);
  });

  it('counts the cap correctly when it bites on a LATER page', async () => {
    // Der Deckel greift erst auf Seite 2, und Seite 2 ist die letzte (kein
    // nextCursor). Die erste Zählformel verrechnete hier einen seitenlokalen
    // mit kumulierten Zählern und kam auf eine negative Zahl — womit auch der
    // `truncated > 0`-Log ausfiel und die Tools wieder lautlos verschwanden.
    const client = withResponses({}, [
      { tools: Array.from({ length: 300 }, (_, i) => ({ name: `a${i}` })), nextCursor: 'c1' },
      { tools: Array.from({ length: 300 }, (_, i) => ({ name: `b${i}` })) },
    ]);

    const tools = await client.listTools();

    expect(tools).toHaveLength(500);
    // 600 geliefert, 500 behalten — die 100 dahinter werden benannt, nicht weg.
    expect(client.truncatedTools).toBe(100);
  });

  it('stops after the page cap instead of following a cursor forever', async () => {
    const client = new UserMCPClient({
      id: 'x',
      name: 'Endlos',
      url: 'https://example.invalid/mcp',
      authType: 'none',
    });
    const request = vi.fn(() => Promise.resolve({ tools: [{ name: 'x' }], nextCursor: 'immer' }));
    (client as unknown as { client: { request: unknown } }).client = { request };

    const tools = await client.listTools();

    expect(request).toHaveBeenCalledTimes(10);
    expect(tools).toHaveLength(10);
  });
});
