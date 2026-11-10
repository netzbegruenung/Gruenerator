import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { loadManagedMcpCatalog } from './managedMcpCatalog.js';

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
// The registry already decided this person may mount it (their row, switched on).
const load = (key: 'bahn' | 'wetter' | 'news' | 'gesetze') =>
  loadManagedMcpCatalog({
    config: { id: `row-${key}`, name: key, url: '', authType: 'none', registryKey: key },
    sse,
    sourceRegistry: createSourceRegistry(),
  });

beforeEach(() => {
  listTools.mockReset();
});

describe('loadManagedMcpCatalog — one scoped connector', () => {
  it('mounts only the named connector, with its prompt hint and <key>__ names', async () => {
    listTools.mockResolvedValue([
      { name: 'forecast', description: 'd', inputSchema: { type: 'object' } },
    ]);
    const cat = await load('wetter');
    expect(Object.keys(cat.tools)).toEqual(['wetter__forecast']);
    expect(cat.labels.get('wetter__forecast')?.origin).toMatchObject({
      kind: 'managed',
      serverId: 'wetter',
    });
    expect(cat.promptHints).toEqual(['Hinweis wetter']);
    expect(cat.resolvedServerId).toBe('row-wetter');
    expect(cat.scopedServerMissing).toBe(false);
    expect(cat.scopedServerUnreachable).toBe(false);
  });

  it('reports a connector whose source is not configured here as missing', async () => {
    const cat = await load('gesetze');
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
});
