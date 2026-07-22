import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadMcpCatalog } from './mcpCatalog.js';

const getConnectionConfigs = vi.fn();
const saveToolsSnapshot = vi.fn();
vi.mock('../../../services/mcp/McpServerRegistry.js', () => ({
  McpServerRegistry: {
    getConnectionConfigs: (...a: unknown[]) => getConnectionConfigs(...a),
    saveToolsSnapshot: (...a: unknown[]) => saveToolsSnapshot(...a),
  },
}));

const connect = vi.fn();
const listTools = vi.fn();
const callTool = vi.fn();
const close = vi.fn();
vi.mock('../../../services/mcp/UserMCPClient.js', () => ({
  UserMCPClient: class {
    name: string;
    id: string;
    constructor(cfg: { id: string; name: string }) {
      this.id = cfg.id;
      this.name = cfg.name;
    }
    connect() {
      return connect(this.name);
    }
    listTools() {
      return listTools(this.name);
    }
    callTool(tool: string, args: unknown) {
      return callTool(this.name, tool, args);
    }
    close() {
      return close(this.name);
    }
  },
}));

function toolExec(tools: Record<string, unknown>, name: string) {
  return (tools[name] as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> })
    .execute;
}

describe('loadMcpCatalog', () => {
  beforeEach(() => {
    getConnectionConfigs.mockReset();
    saveToolsSnapshot.mockReset();
    connect.mockReset().mockResolvedValue(undefined);
    listTools.mockReset();
    callTool.mockReset();
    close.mockReset().mockResolvedValue(undefined);
  });

  it('signals scopedServerMissing when a scoped server has no config', async () => {
    getConnectionConfigs.mockResolvedValue([]);
    const cat = await loadMcpCatalog({ userId: 'u1', scope: 'srv-gone' });
    expect(cat.scopedServerMissing).toBe(true);
    expect(Object.keys(cat.tools)).toHaveLength(0);
  });

  it('does not signal missing for an unscoped turn with no servers', async () => {
    getConnectionConfigs.mockResolvedValue([]);
    const cat = await loadMcpCatalog({ userId: 'u1', scope: null });
    expect(cat.scopedServerMissing).toBe(false);
  });

  it('namespaces tools per stable server key (mcp_servers.id) and labels them', async () => {
    getConnectionConfigs.mockResolvedValue([
      { id: 'a', name: 'Notion', url: 'https://x', authType: 'none', token: null },
      { id: 'b', name: 'Brevo', url: 'https://y', authType: 'none', token: null },
    ]);
    listTools.mockImplementation((serverName: string) =>
      serverName === 'Notion'
        ? [{ name: 'search page', description: 'find', inputSchema: { type: 'object' } }]
        : [{ name: 'send', description: 'mail', inputSchema: { type: 'object' } }]
    );
    const cat = await loadMcpCatalog({ userId: 'u1', scope: null });
    const names = Object.keys(cat.tools).sort();
    // `m<serverKey>__<tool>` where serverKey = id without dashes, first 8 chars.
    expect(names).toEqual(['ma__search_page', 'mb__send']);
    expect(cat.labels.get('ma__search_page')).toEqual({
      serverName: 'Notion',
      toolName: 'search page',
    });
    expect(saveToolsSnapshot).toHaveBeenCalledTimes(2);
  });

  it('tool name is stable across turns (derived from server id, not index)', async () => {
    const configs = [
      {
        id: '9f8c7b6a-1111-2222-3333-444455556666',
        name: 'Notion',
        url: 'https://x',
        authType: 'none',
        token: null,
      },
    ];
    getConnectionConfigs.mockResolvedValue(configs);
    listTools.mockResolvedValue([
      { name: 'search page', description: 'find', inputSchema: { type: 'object' } },
    ]);
    const a = await loadMcpCatalog({ userId: 'u1', scope: null });
    const b = await loadMcpCatalog({ userId: 'u1', scope: null });
    const nameA = Object.keys(a.tools)[0];
    expect(nameA).toBe('m9f8c7b6a__search_page');
    expect(Object.keys(b.tools)[0]).toBe(nameA);
    expect(nameA).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it('execute() returns {content} on success and {error} on failure', async () => {
    getConnectionConfigs.mockResolvedValue([
      { id: 'a', name: 'Notion', url: 'https://x', authType: 'none', token: null },
    ]);
    listTools.mockResolvedValue([
      { name: 'get', description: 'd', inputSchema: { type: 'object' } },
    ]);
    callTool.mockResolvedValueOnce({ ok: true, content: 'Seiteninhalt' });
    const cat = await loadMcpCatalog({ userId: 'u1', scope: 'a' });
    const ok = (await toolExec(cat.tools, 'ma__get')({ q: 1 }, { toolCallId: 'c1' })) as {
      content?: string;
    };
    expect(ok.content).toBe('Seiteninhalt');

    callTool.mockResolvedValueOnce({ ok: false, content: 'MCP-Client nicht verbunden.' });
    const err = (await toolExec(cat.tools, 'ma__get')({}, { toolCallId: 'c2' })) as {
      error?: string;
    };
    expect(err.error).toBe('MCP-Client nicht verbunden.');
  });

  it('builds a per-server catalogSummary annotating each tool with its required params', async () => {
    getConnectionConfigs.mockResolvedValue([
      { id: 'a', name: 'Sally', url: 'https://x', authType: 'none', token: null },
    ]);
    listTools.mockResolvedValue([
      { name: 'get_recordings', description: 'list recordings', inputSchema: { type: 'object' } },
      { name: 'get_summary', description: 'summary', inputSchema: { type: 'object' } },
      {
        name: 'search_appointments',
        description: 'search',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            participant: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
          required: ['subject', 'participant', 'startDate', 'endDate'],
        },
      },
    ]);
    const cat = await loadMcpCatalog({ userId: 'u1', scope: 'a' });
    expect(cat.catalogSummary).toBe(
      'Sally · get_recordings (keine Pflichtfelder) · get_summary (keine Pflichtfelder) · search_appointments (benötigt: subject|participant|startDate|endDate)'
    );
  });

  it('appends a required-params suffix to a tool description', async () => {
    getConnectionConfigs.mockResolvedValue([
      { id: 'a', name: 'Sally', url: 'https://x', authType: 'none', token: null },
    ]);
    listTools.mockResolvedValue([
      {
        name: 'search',
        description: 'find things',
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string' }, since: { type: 'string' } },
          required: ['q', 'since'],
        },
      },
    ]);
    const cat = await loadMcpCatalog({ userId: 'u1', scope: 'a' });
    const desc = (cat.tools['ma__search'] as { description: string }).description;
    expect(desc).toBe('[Sally] find things — Pflichtfelder: q, since');
  });

  it('skips a dead server without failing the others, and closes it', async () => {
    getConnectionConfigs.mockResolvedValue([
      { id: 'a', name: 'Dead', url: 'https://x', authType: 'none', token: null },
      { id: 'b', name: 'Live', url: 'https://y', authType: 'none', token: null },
    ]);
    connect.mockImplementation((serverName: string) =>
      serverName === 'Dead' ? Promise.reject(new Error('unreachable')) : Promise.resolve(undefined)
    );
    listTools.mockResolvedValue([
      { name: 'ok', description: 'd', inputSchema: { type: 'object' } },
    ]);
    const cat = await loadMcpCatalog({ userId: 'u1', scope: null });
    expect(Object.keys(cat.tools)).toEqual(['mb__ok']);
    expect(close).toHaveBeenCalledWith('Dead');
    await cat.close();
    expect(close).toHaveBeenCalledWith('Live');
  });
});
