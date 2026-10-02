/**
 * Ein Turn lädt genau den Konnektor, den er anspricht.
 *
 * `getConnectionConfigs` hängte die verwalteten Konnektoren (Bahn, Wetter,
 * tagesschau, …) an jeden Aufruf, auch an einen gescopten — und weil sie
 * schneller verbanden, belegten sie das gemeinsame Werkzeug-Limit, bevor der
 * erwähnte Server an der Reihe war (Typeform: 22 von 64 Werkzeugen).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MCP_SERVERS = { table: 'mcp_servers' };
const SYSTEM_PREFS = { table: 'mcp_system_prefs' };
vi.mock('../../database/schema/mcpServers.js', () => ({ mcp_servers: MCP_SERVERS }));
vi.mock('../../database/schema/mcpSystemPrefs.js', () => ({ mcp_system_prefs: SYSTEM_PREFS }));
vi.mock('drizzle-orm', () => ({ and: () => ({}), eq: () => ({}) }));

let serverRows: Record<string, unknown>[] = [];
let prefRows: Record<string, unknown>[] = [];
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(table === SYSTEM_PREFS ? prefRows : serverRows),
      }),
    }),
  }),
}));

vi.mock('./systemMcpServers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./systemMcpServers.js')>();
  const connector = (key: 'bahn' | 'wetter', title: string) => ({
    key,
    id: `system-${key}`,
    name: title,
    connector: { title, description: `${title}-Beschreibung`, category: 'c' },
    url: `https://${key}.example`,
    authType: 'none' as const,
    token: null,
  });
  const all = [connector('bahn', 'Deutsche Bahn'), connector('wetter', 'Wetter')];
  return {
    ...actual,
    getManagedConnectors: () => all,
    getManagedConnectorById: (id: string) => all.find((c) => c.id === id) ?? null,
  };
});

const { McpServerRegistry } = await import('./McpServerRegistry.js');

const USER_ROW = {
  id: '5fda4d79-0000-0000-0000-000000000000',
  name: 'Tally',
  url: 'https://mcp.tally.so',
  auth_type: 'none',
  token_encrypted: null,
  tool_fingerprints: null,
  tools_snapshot: [{ name: 'create_form' }],
};

beforeEach(() => {
  serverRows = [];
  prefRows = [];
});

describe('getConnectionConfigs — immer genau ein Server', () => {
  it('liefert für einen eigenen Server nur dessen Zeile, ohne verwaltete Mitläufer', async () => {
    serverRows = [USER_ROW];
    const configs = await McpServerRegistry.getConnectionConfigs('u1', USER_ROW.id);
    expect(configs.map((c) => c.name)).toEqual(['Tally']);
  });

  it('liefert für einen verwalteten Scope nur diesen Konnektor', async () => {
    const configs = await McpServerRegistry.getConnectionConfigs('u1', 'system-wetter');
    expect(configs.map((c) => c.id)).toEqual(['system-wetter']);
  });

  it('liefert nichts für einen ausgeschalteten verwalteten Konnektor', async () => {
    prefRows = [{ system_key: 'wetter', enabled: false, updated_at: new Date() }];
    expect(await McpServerRegistry.getConnectionConfigs('u1', 'system-wetter')).toEqual([]);
  });
});

describe('getClassifierContext — verwaltete Konnektoren nur per @', () => {
  it('führt nur die eigenen Server — „Wetter" und „Gesetze" sind Alltagswörter', async () => {
    serverRows = [USER_ROW];
    const servers = await McpServerRegistry.getClassifierContext('u-ctx-1');
    expect(servers.map((s) => [s.id, s.name])).toEqual([[USER_ROW.id, 'Tally']]);
  });
});
