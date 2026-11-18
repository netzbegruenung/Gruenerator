/**
 * Ein Turn lädt genau den Konnektor, den er anspricht — und ein bekannter
 * Konnektor (Bahn, Wetter, Rateo, …) ist seit 11/2026 eine gewöhnliche Zeile
 * mit `registry_key`, keine synthetische `system-<key>`-ID mehr.
 *
 * `getConnectionConfigs` hängte die verwalteten Konnektoren früher an jeden
 * Aufruf, auch an einen gescopten — und weil sie schneller verbanden, belegten
 * sie das gemeinsame Werkzeug-Limit, bevor der erwähnte Server an der Reihe war
 * (Typeform: 22 von 64 Werkzeugen).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MCP_SERVERS = { table: 'mcp_servers' };
vi.mock('../../database/schema/mcpServers.js', () => ({ mcp_servers: MCP_SERVERS }));
vi.mock('drizzle-orm', () => ({
  and: () => ({}),
  eq: () => ({}),
  isNotNull: () => ({}),
  sql: () => ({}),
}));

let serverRows: Record<string, unknown>[] = [];
let inserted: Record<string, unknown>[] = [];
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: () => ({ where: () => Promise.resolve(serverRows) }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoUpdate: () => ({
          returning: () => {
            // The unique (user_id, registry_key) index: a second connect hits
            // the existing row instead of inserting another.
            const existing = inserted.find(
              (r) => r.user_id === v.user_id && r.registry_key === v.registry_key
            );
            const row = existing ?? {
              ...v,
              id: `row-${inserted.length + 1}`,
              token_encrypted: null,
              tools_snapshot: null,
              tools_drift: null,
              created_at: new Date(0),
              updated_at: new Date(0),
            };
            if (!existing) inserted.push(row);
            return Promise.resolve([row]);
          },
        }),
      }),
    }),
  }),
}));

let activeKeys = new Set(['bahn', 'wetter', 'rateo']);
vi.mock('./connectorAdapters.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./connectorAdapters.js')>();
  const connector = (key: 'bahn' | 'wetter' | 'rateo', title: string) => ({
    key,
    id: `system-${key}`,
    name: title,
    connector: { title, description: `${title}-Beschreibung`, category: 'c' },
    url: `https://${key}.example`,
    authType: 'none' as const,
    token: null,
    toolAllowlist: null,
  });
  const all = [
    connector('bahn', 'Deutsche Bahn'),
    connector('wetter', 'Wetter'),
    connector('rateo', 'Rateo'),
  ];
  return {
    ...actual,
    getManagedConnectors: () => all.filter((c) => activeKeys.has(c.key)),
  };
});

const { McpServerRegistry, RegistryConnectorPatchError } = await import('./McpServerRegistry.js');

const USER_ROW = {
  id: '5fda4d79-0000-0000-0000-000000000000',
  name: 'Tally',
  url: 'https://mcp.tally.so',
  auth_type: 'none',
  token_encrypted: null,
  tool_fingerprints: null,
  tools_snapshot: [{ name: 'create_form' }],
  tools_drift: null,
  registry_key: null,
  enabled: true,
  created_at: new Date(0),
  updated_at: new Date(0),
};

const RATEO_ROW = {
  ...USER_ROW,
  id: '7a1b0000-0000-0000-0000-000000000000',
  name: 'rateo',
  url: '',
  tools_snapshot: null,
  registry_key: 'rateo',
};

beforeEach(() => {
  serverRows = [];
  inserted = [];
  activeKeys = new Set(['bahn', 'wetter', 'rateo']);
});

describe('getConnectionConfigs — immer genau ein Server', () => {
  it('liefert für einen eigenen Server nur dessen Zeile', async () => {
    serverRows = [USER_ROW];
    const configs = await McpServerRegistry.getConnectionConfigs('u1', USER_ROW.id);
    expect(configs.map((c) => c.name)).toEqual(['Tally']);
    expect(configs[0]?.registryKey ?? null).toBeNull();
  });

  it('löst eine Zeile mit Schlüssel über die Env auf — URL nie aus der Zeile', async () => {
    serverRows = [RATEO_ROW];
    const configs = await McpServerRegistry.getConnectionConfigs('u1', RATEO_ROW.id);
    expect(configs.map((c) => [c.id, c.registryKey, c.url])).toEqual([
      [RATEO_ROW.id, 'rateo', 'https://rateo.example'],
    ]);
  });

  it('löst den alten Alias system-<key> auf die Zeile der Person auf', async () => {
    serverRows = [RATEO_ROW];
    const configs = await McpServerRegistry.getConnectionConfigs('u1', 'system-rateo');
    expect(configs.map((c) => [c.id, c.registryKey])).toEqual([[RATEO_ROW.id, 'rateo']]);
  });

  it('liefert nichts für einen Alias ohne Zeile (nie verbunden oder getrennt)', async () => {
    expect(await McpServerRegistry.getConnectionConfigs('u1', 'system-rateo')).toEqual([]);
  });

  it('liefert nichts, wenn die Env-URL fehlt (Kill-Switch)', async () => {
    serverRows = [RATEO_ROW];
    activeKeys = new Set(['bahn']);
    expect(await McpServerRegistry.getConnectionConfigs('u1', RATEO_ROW.id)).toEqual([]);
  });
});

describe('resolveServerId', () => {
  it('lässt eine Zeilen-ID unverändert', async () => {
    expect(await McpServerRegistry.resolveServerId('u1', USER_ROW.id)).toBe(USER_ROW.id);
  });

  it('weist unbekannte Aliase und Nicht-UUIDs ab, statt sie an den uuid-Cast zu geben', async () => {
    serverRows = [RATEO_ROW];
    expect(await McpServerRegistry.resolveServerId('u1', 'system-nichtsda')).toBeNull();
    expect(await McpServerRegistry.resolveServerId('u1', 'kein-uuid')).toBeNull();
    expect(await McpServerRegistry.getConnectionConfigs('u1', 'system-nichtsda')).toEqual([]);
  });

  it('übersetzt system-<key> in die Zeilen-ID, ohne Zeile in null', async () => {
    serverRows = [RATEO_ROW];
    expect(await McpServerRegistry.resolveServerId('u1', 'system-rateo')).toBe(RATEO_ROW.id);
    serverRows = [];
    expect(await McpServerRegistry.resolveServerId('u1', 'system-rateo')).toBeNull();
  });
});

describe('list — nur Zeilen', () => {
  it('zeigt eine Zeile mit Schlüssel mit Name und Beschreibung aus der Definition, ohne URL', async () => {
    serverRows = [RATEO_ROW, USER_ROW];
    const list = await McpServerRegistry.list('u1');
    expect(
      list.map((s) => [s.id, s.name, s.url, s.registryKey ?? null, s.managed ?? false])
    ).toEqual([
      [RATEO_ROW.id, 'Rateo', '', 'rateo', true],
      [USER_ROW.id, 'Tally', 'https://mcp.tally.so', null, false],
    ]);
    expect(list[0]?.description).toBe('Rateo-Beschreibung');
  });

  it('lässt eine Zeile aus, deren Quelle in diesem Deployment nicht aktiv ist', async () => {
    serverRows = [RATEO_ROW, USER_ROW];
    activeKeys = new Set(['bahn']);
    expect((await McpServerRegistry.list('u1')).map((s) => s.id)).toEqual([USER_ROW.id]);
  });

  it('listet keine nie verbundenen Konnektoren mehr — die stehen im Verzeichnis', async () => {
    expect(await McpServerRegistry.list('u1')).toEqual([]);
  });
});

describe('connectRegistryConnector', () => {
  it('ist idempotent: zweimal verbinden ergibt dieselbe Zeile', async () => {
    const a = await McpServerRegistry.connectRegistryConnector('u1', 'rateo');
    const b = await McpServerRegistry.connectRegistryConnector('u1', 'rateo');
    expect(a?.id).toBeTruthy();
    expect(b?.id).toBe(a?.id);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ url: '', auth_type: 'none', registry_key: 'rateo' });
    expect(a).toMatchObject({ name: 'Rateo', url: '', registryKey: 'rateo', enabled: true });
  });

  it('belegt keinen Namen, den eine Person für einen eigenen Server wählen könnte', async () => {
    // mcp_servers hat UNIQUE (user_id, name): ein Schlüssel als Name kollidierte
    // mit einem eigenen Server namens „news" oder „wetter".
    await McpServerRegistry.connectRegistryConnector('u1', 'wetter');
    expect(inserted[0]?.name).toBe('registry:wetter');
  });

  it('verbindet nichts, dessen Env-URL fehlt', async () => {
    activeKeys = new Set(['bahn']);
    expect(await McpServerRegistry.connectRegistryConnector('u1', 'rateo')).toBeNull();
    expect(inserted).toHaveLength(0);
  });
});

describe('update — Zeilen mit Schlüssel lassen sich nur schalten', () => {
  it('lehnt URL, Token, Auth und Name ab', async () => {
    serverRows = [RATEO_ROW];
    for (const patch of [
      { url: 'https://evil.example' },
      { token: 'x' },
      { authType: 'bearer' as const },
      { name: 'Anders' },
      { oauthClientId: 'c' },
    ]) {
      await expect(McpServerRegistry.update('u1', RATEO_ROW.id, patch)).rejects.toBeInstanceOf(
        RegistryConnectorPatchError
      );
    }
  });
});

describe('getClassifierContext — bekannte Konnektoren nur per @', () => {
  it('führt nur die eigenen Server — „Wetter" und „Gesetze" sind Alltagswörter', async () => {
    serverRows = [{ ...RATEO_ROW, registry_key: 'wetter', name: 'wetter' }, USER_ROW];
    const servers = await McpServerRegistry.getClassifierContext('u-ctx-1');
    expect(servers.map((s) => [s.id, s.name])).toEqual([[USER_ROW.id, 'Tally']]);
  });
});
