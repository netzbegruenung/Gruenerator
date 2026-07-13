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

  it('namespaces tools per server index and labels them', async () => {
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
    expect(names).toEqual(['s0__search_page', 's1__send']);
    expect(cat.labels.get('s0__search_page')).toEqual({
      serverName: 'Notion',
      toolName: 'search page',
    });
    expect(saveToolsSnapshot).toHaveBeenCalledTimes(2);
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
    const ok = (await toolExec(cat.tools, 's0__get')({ q: 1 }, { toolCallId: 'c1' })) as {
      content?: string;
    };
    expect(ok.content).toBe('Seiteninhalt');

    callTool.mockResolvedValueOnce({ ok: false, content: 'MCP-Client nicht verbunden.' });
    const err = (await toolExec(cat.tools, 's0__get')({}, { toolCallId: 'c2' })) as {
      error?: string;
    };
    expect(err.error).toBe('MCP-Client nicht verbunden.');
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
    expect(Object.keys(cat.tools)).toEqual(['s1__ok']);
    expect(close).toHaveBeenCalledWith('Dead');
    await cat.close();
    expect(close).toHaveBeenCalledWith('Live');
  });
});
