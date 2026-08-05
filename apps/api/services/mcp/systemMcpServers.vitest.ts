import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getManagedConnectorById,
  getManagedConnectors,
  getSystemMcpSources,
  isManagedKey,
  isSourceGermanOnly,
  managedConnectorId,
  parseManagedConnectorId,
  toSystemConnectionConfig,
} from './systemMcpServers.js';

const sourceByKey = (key: string) => getSystemMcpSources().find((s) => s.key === key) ?? null;
const managedKeys = (locale?: string | null) => getManagedConnectors(locale).map((c) => c.key);

const ENV_KEYS = [
  'SYSTEM_MCP_DB_URL',
  'SYSTEM_MCP_DB_TOKEN',
  'SYSTEM_MCP_WEATHER_URL',
  'SYSTEM_MCP_WEATHER_TOKEN',
  'SYSTEM_MCP_ARD_URL',
  'SYSTEM_MCP_ARD_TOKEN',
  'SYSTEM_MCP_TRIVAGO_URL',
  'SYSTEM_MCP_TRIVAGO_TOKEN',
  'SYSTEM_MCP_LAW_URL',
  'SYSTEM_MCP_LAW_TOKEN',
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const allConfigured = () => {
  process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
  process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
  process.env.SYSTEM_MCP_ARD_URL = 'https://ard.example.org/mcp';
  process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example.org/mcp';
  process.env.SYSTEM_MCP_LAW_URL = 'https://law.example.org/mcp';
};

describe('getSystemMcpSources (env matrix)', () => {
  it('returns nothing when no env URLs are set (feature off)', () => {
    expect(getSystemMcpSources()).toEqual([]);
    expect(getManagedConnectors()).toEqual([]);
  });

  it('activates exactly the sources whose URL env is set', () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    process.env.SYSTEM_MCP_ARD_URL = 'https://ard.example.org/mcp';
    expect(getSystemMcpSources().map((s) => s.key)).toEqual(['bahn', 'news']);
    expect(managedKeys()).toEqual(['bahn', 'news']);
  });

  it('token env switches auth to shared bearer', () => {
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
    const noToken = sourceByKey('wetter');
    expect(noToken?.authType).toBe('none');
    expect(noToken?.token).toBeNull();

    process.env.SYSTEM_MCP_WEATHER_TOKEN = 'secret';
    const withToken = sourceByKey('wetter');
    expect(withToken?.authType).toBe('bearer');
    expect(withToken?.token).toBe('secret');
  });

  it('every source ships capability + promptHint copy and a connector card', () => {
    allConfigured();
    for (const s of getSystemMcpSources()) {
      expect(s.capability.length).toBeGreaterThan(10);
      expect(s.promptHint.length).toBeGreaterThan(10);
      expect(s.connector.title.length).toBeGreaterThan(1);
      expect(s.connector.description.length).toBeGreaterThan(10);
      expect(s.connector.category.length).toBeGreaterThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Managed connectors — the only door these sources have. `getSourcesForIntent`
// and `isSystemIntentAvailable` are gone with the intents they answered for.
// ---------------------------------------------------------------------------

describe('managed connectors', () => {
  it('offers every configured source, in MANAGED_KEYS order', () => {
    allConfigured();
    expect(managedKeys()).toEqual(['bahn', 'hotel', 'wetter', 'news', 'gesetze']);
    for (const key of ['bahn', 'hotel', 'wetter', 'news', 'gesetze'] as const) {
      expect(isManagedKey(key)).toBe(true);
    }
  });

  it('offers nothing while the URL env is unset', () => {
    expect(getManagedConnectors()).toEqual([]);
    expect(getManagedConnectorById('system-gesetze')).toBeNull();
  });

  it('resolves one connector by its synthetic id', () => {
    allConfigured();
    const gesetze = getManagedConnectorById('system-gesetze');
    expect(gesetze?.key).toBe('gesetze');
    expect(gesetze?.connector.title).toBe('Gesetze');
    expect(getManagedConnectorById('system-nichtsda')).toBeNull();
  });

  it('round-trips the synthetic id and rejects a user UUID', () => {
    expect(managedConnectorId('gesetze')).toBe('system-gesetze');
    expect(parseManagedConnectorId('system-gesetze')).toBe('gesetze');
    // A user's own server id must never be mistaken for a managed one.
    expect(parseManagedConnectorId('3f2a9c14-0b7d-4e51-8a6f-2c9e1d7b4a08')).toBeNull();
    expect(parseManagedConnectorId('system-nichtsda')).toBeNull();
    expect(parseManagedConnectorId('')).toBeNull();
  });

  it('keeps the tool-name prefix mcpCatalog derives valid and distinct', () => {
    // mcpCatalog builds `m${id.replace(/-/g,'').slice(0,8)}__<tool>` and the
    // provider tool-name regex is ^[a-zA-Z0-9_-]{1,64}$ — a `:` separator here
    // would produce names every provider rejects.
    const prefixes = (['bahn', 'hotel', 'wetter', 'news', 'gesetze'] as const).map((k) =>
      managedConnectorId(k).replace(/-/g, '').slice(0, 8)
    );
    for (const p of prefixes) expect(p).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('marks the connection config as managed so no row write is attempted', () => {
    process.env.SYSTEM_MCP_LAW_URL = 'https://law.example.org/mcp';
    process.env.SYSTEM_MCP_LAW_TOKEN = 'secret';
    const config = toSystemConnectionConfig(sourceByKey('gesetze')!);
    expect(config.managed).toBe(true);
    expect(config.id).toBe('system-gesetze');
    expect(config.authType).toBe('bearer');
  });

  it('caps the two big catalogs with an allowlist', () => {
    // Managed connectors mount whenever their vocabulary appears, so their tool
    // schemas ride along on ordinary turns. Open-Meteo ships 17 tools with large
    // per-vendor enums and german-law 8; both are capped. bahn/news/hotel are
    // small enough to mount whole.
    allConfigured();
    expect(sourceByKey('wetter')?.toolAllowlist).toHaveLength(5);
    expect(sourceByKey('gesetze')?.toolAllowlist).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Audience. A source is dropped when its data does not cover the user's
// country — per SOURCE, which is now the only grain there is.
// ---------------------------------------------------------------------------

describe('audience', () => {
  it('keeps every connector for a German user', () => {
    allConfigured();
    expect(managedKeys('de-DE')).toEqual(['bahn', 'hotel', 'wetter', 'news', 'gesetze']);
  });

  it('drops only the German-only connectors for an Austrian user', () => {
    allConfigured();
    expect(managedKeys('de-AT')).toEqual(['hotel', 'wetter']);
  });

  it('keeps the full set when no locale is given', () => {
    // The explicit-mention path passes no locale on purpose: somebody who types
    // `@bahn` asked for that server, whatever country they are in.
    allConfigured();
    expect(managedKeys()).toHaveLength(5);
  });

  it('answers the German-only question per source', () => {
    expect(isSourceGermanOnly('bahn')).toBe(true);
    expect(isSourceGermanOnly('news')).toBe(true);
    expect(isSourceGermanOnly('gesetze')).toBe(true);
    expect(isSourceGermanOnly('wetter')).toBe(false);
    expect(isSourceGermanOnly('hotel')).toBe(false);
  });
});
