import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { loadManagedMcpCatalog } from './managedMcpCatalog.js';

const getDisabledManagedKeys = vi.fn<(userId: string) => Promise<Set<string>>>();
vi.mock('../../../services/mcp/McpServerRegistry.js', () => ({
  McpServerRegistry: {
    getDisabledManagedKeys: (userId: string) => getDisabledManagedKeys(userId),
  },
}));

const source = (key: string, name: string) => ({
  key,
  name,
  id: `system-${key}`,
  connector: { title: name, description: 'd', category: 'c' },
  url: `https://${key}.example`,
  authType: 'none',
  token: null,
  capability: 'c',
  promptHint: `Hinweis ${key}`,
  toolAllowlist: null,
});
vi.mock('../../../services/mcp/systemMcpServers.js', () => ({
  getManagedConnectors: () => [
    source('bahn', 'Deutsche Bahn'),
    source('wetter', 'Wetter'),
    source('news', 'tagesschau'),
  ],
  toSystemConnectionConfig: (s: { key: string; name: string }) => ({
    id: `system-${s.key}`,
    name: s.name,
  }),
}));

const listTools = vi.fn<(name: string) => Promise<unknown[]>>();
vi.mock('../../../services/mcp/UserMCPClient.js', () => ({
  UserMCPClient: class {
    name: string;
    constructor(cfg: { name: string }) {
      this.name = cfg.name;
    }
    connect() {
      return Promise.resolve();
    }
    listTools() {
      return listTools(this.name);
    }
    close() {
      return Promise.resolve();
    }
  },
}));

const sse = { send: () => {} } as unknown as SSEWriter;
const load = (key: 'bahn' | 'wetter' | 'news') =>
  loadManagedMcpCatalog({ key, sse, sourceRegistry: createSourceRegistry(), userId: 'u1' });

beforeEach(() => {
  getDisabledManagedKeys.mockReset().mockResolvedValue(new Set());
  listTools.mockReset();
});

describe('loadManagedMcpCatalog — one scoped connector', () => {
  it('mounts only the named connector, with its prompt hint', async () => {
    listTools.mockResolvedValue([
      { name: 'forecast', description: 'd', inputSchema: { type: 'object' } },
    ]);
    const cat = await load('wetter');
    expect(Object.keys(cat.tools)).toEqual(['wetter__forecast']);
    expect(cat.promptHints).toEqual(['Hinweis wetter']);
    expect(cat.scopedServerMissing).toBe(false);
    expect(cat.scopedServerUnreachable).toBe(false);
  });

  it('reports a switched-off connector as missing, not as an empty mount', async () => {
    getDisabledManagedKeys.mockResolvedValue(new Set(['bahn']));
    const cat = await load('bahn');
    expect(cat.tools).toEqual({});
    expect(cat.scopedServerMissing).toBe(true);
    expect(listTools).not.toHaveBeenCalled();
  });

  it('reports a connector whose tools cannot be listed as unreachable', async () => {
    listTools.mockRejectedValue(new Error('down'));
    const cat = await load('news');
    expect(cat.tools).toEqual({});
    expect(cat.scopedServerUnreachable).toBe(true);
    expect(cat.promptHints).toEqual([]);
  });

  it('reports the connector as unreachable when the opt-out prefs cannot be read', async () => {
    getDisabledManagedKeys.mockRejectedValue(new Error('db down'));
    const cat = await load('bahn');
    expect(cat.tools).toEqual({});
    expect(cat.scopedServerUnreachable).toBe(true);
  });
});
