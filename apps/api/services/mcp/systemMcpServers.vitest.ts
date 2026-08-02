import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getManagedConnectorById,
  getManagedConnectors,
  getSourcesForIntent,
  getSystemMcpSources,
  isManagedKey,
  isSourceGermanOnly,
  isSystemIntentAvailable,
  managedConnectorId,
  parseManagedConnectorId,
  toSystemConnectionConfig,
} from './systemMcpServers.js';

const sourceByKey = (key: string) => getSystemMcpSources().find((s) => s.key === key) ?? null;

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

describe('getSystemMcpSources (env matrix)', () => {
  it('returns nothing when no env URLs are set (feature off)', () => {
    expect(getSystemMcpSources()).toEqual([]);
    expect(isSystemIntentAvailable('bahn')).toBe(false);
    expect(isSystemIntentAvailable('wetter')).toBe(false);
    expect(isSystemIntentAvailable('news')).toBe(false);
  });

  it('activates exactly the sources whose URL env is set', () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    process.env.SYSTEM_MCP_ARD_URL = 'https://ard.example.org/mcp';
    const keys = getSystemMcpSources().map((s) => s.key);
    expect(keys).toEqual(['bahn', 'news']);
    expect(isSystemIntentAvailable('bahn')).toBe(true);
    expect(isSystemIntentAvailable('wetter')).toBe(false);
    expect(isSystemIntentAvailable('news')).toBe(true);
  });

  it('each remaining intent maps to exactly its own source', () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example.org/mcp';
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
    expect(getSourcesForIntent('bahn').map((s) => s.key)).toEqual(['bahn']);
    expect(getSourcesForIntent('hotel').map((s) => s.key)).toEqual(['hotel']);
    expect(getSourcesForIntent('wetter').map((s) => s.key)).toEqual(['wetter']);
  });

  it('reise is switched off — no source, whatever the env says', () => {
    // The travel umbrella used to mount bahn + hotel + wetter in one turn. It was
    // the only intent mixing a German-only source with global ones, so an Austrian
    // travel turn could force the loop and mount nothing. Off until there is an
    // ÖBB counterpart; the enum value stays, the intent degrades to web.
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example.org/mcp';
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
    expect(getSourcesForIntent('reise')).toEqual([]);
    expect(isSystemIntentAvailable('reise')).toBe(false);
    expect(isSystemIntentAvailable('reise', 'de-DE')).toBe(false);
    expect(isSystemIntentAvailable('reise', 'de-AT')).toBe(false);
  });

  it('non-system intents are never "available"', () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    expect(isSystemIntentAvailable('search')).toBe(false);
    expect(isSystemIntentAvailable('mcp')).toBe(false);
    expect(isSystemIntentAvailable('bundestag')).toBe(false);
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

  it('connection config carries a stable system id and the env URL', () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    const source = sourceByKey('bahn');
    expect(source).not.toBeNull();
    const config = toSystemConnectionConfig(source!);
    expect(config.id).toBe('system-bahn');
    expect(config.url).toBe('https://db.example.org/mcp');
    expect(config.name).toBe('Deutsche Bahn');
  });

  it('every source ships capability + promptHint copy', () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
    process.env.SYSTEM_MCP_ARD_URL = 'https://ard.example.org/mcp';
    for (const s of getSystemMcpSources()) {
      expect(s.capability.length).toBeGreaterThan(10);
      expect(s.promptHint.length).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// Locale gating. A source is dropped when its data does not cover the user's
// country — resolved per SOURCE, not per intent, because `reise` mounts three
// at once and only the train one is German-only.
// ---------------------------------------------------------------------------

describe('locale gating', () => {
  const allConfigured = () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example';
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://weather.example';
    process.env.SYSTEM_MCP_ARD_URL = 'https://ard.example';
    process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example';
  };

  it('keeps every source for a German user', () => {
    allConfigured();
    expect(getSourcesForIntent('bahn', 'de-DE')).toHaveLength(1);
    expect(getSourcesForIntent('news', 'de-DE')).toHaveLength(1);
    expect(getSourcesForIntent('wetter', 'de-DE')).toHaveLength(1);
    expect(getSourcesForIntent('hotel', 'de-DE')).toHaveLength(1);
  });

  it('drops only the German-only sources for an Austrian user', () => {
    allConfigured();
    expect(getSourcesForIntent('bahn', 'de-AT')).toHaveLength(0);
    expect(getSourcesForIntent('news', 'de-AT')).toHaveLength(0);
    // Global sources are untouched.
    expect(getSourcesForIntent('wetter', 'de-AT')).toHaveLength(1);
    expect(getSourcesForIntent('hotel', 'de-AT')).toHaveLength(1);
  });

  it('keeps the full set when no locale is given (health checks, catalogs)', () => {
    allConfigured();
    expect(getSourcesForIntent('bahn')).toHaveLength(1);
    expect(getSourcesForIntent('news')).toHaveLength(1);
  });

  it('reports availability per locale', () => {
    allConfigured();
    expect(isSystemIntentAvailable('bahn', 'de-DE')).toBe(true);
    expect(isSystemIntentAvailable('bahn', 'de-AT')).toBe(false);
    // Global sources survive the Austrian gate.
    expect(isSystemIntentAvailable('wetter', 'de-AT')).toBe(true);
    expect(isSystemIntentAvailable('hotel', 'de-AT')).toBe(true);
  });

  it('derives DE_ONLY_SYSTEM_INTENTS instead of hand-listing it', async () => {
    const { DE_ONLY_SYSTEM_INTENTS } = await import('./systemMcpServers.js');
    expect([...DE_ONLY_SYSTEM_INTENTS].sort()).toEqual(['bahn', 'news']);
    // `reise` is absent for a different reason than before: it has no sources at
    // all now, so it degrades via the availability check, not the audience one.
    expect(DE_ONLY_SYSTEM_INTENTS.has('reise' as never)).toBe(false);
  });

  it('answers the German-only question per SOURCE, not per intent', () => {
    // `gesetze` is a source with no intent of the same name, so the intent set
    // cannot answer for it. This is the distinction that used to be invisible
    // because every source key happened to be an intent name too.
    expect(isSourceGermanOnly('gesetze')).toBe(true);
    expect(isSourceGermanOnly('bahn')).toBe(true);
    expect(isSourceGermanOnly('wetter')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Managed connectors: the same env-gated sources, offered through the connector
// path (settings list, @mention) instead of an intent.
// ---------------------------------------------------------------------------

describe('managed connectors', () => {
  it('offers nothing while the URL env is unset', () => {
    expect(getManagedConnectors()).toEqual([]);
    expect(getManagedConnectorById('system-gesetze')).toBeNull();
  });

  it('offers gesetze once its URL is configured', () => {
    process.env.SYSTEM_MCP_LAW_URL = 'https://law.example.org/mcp';
    const connectors = getManagedConnectors();
    expect(connectors.map((c) => c.key)).toEqual(['gesetze']);
    expect(connectors[0]?.id).toBe('system-gesetze');
    expect(connectors[0]?.connector.title).toBe('Gesetze');
  });

  it('leaves the four intent-routed sources OUT of the connector list', () => {
    // They are still intents (INTENT_SOURCES). Listing them here too would give
    // the user a switch that governs only half of them — see MANAGED_KEYS.
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
    process.env.SYSTEM_MCP_ARD_URL = 'https://ard.example.org/mcp';
    process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example.org/mcp';
    expect(getManagedConnectors()).toEqual([]);
    for (const key of ['bahn', 'wetter', 'news', 'hotel'] as const) {
      expect(isManagedKey(key)).toBe(false);
    }
    expect(isManagedKey('gesetze')).toBe(true);
  });

  it('gesetze is a connector only — no intent mounts it', () => {
    process.env.SYSTEM_MCP_LAW_URL = 'https://law.example.org/mcp';
    expect(getSourcesForIntent('gesetze')).toEqual([]);
    expect(isSystemIntentAvailable('gesetze')).toBe(false);
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
    const prefixes = (['bahn', 'wetter', 'news', 'hotel', 'gesetze'] as const).map((k) =>
      managedConnectorId(k).replace(/-/g, '').slice(0, 8)
    );
    for (const p of prefixes) expect(p).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('drops a German-only connector for an Austrian user when a locale is given', () => {
    process.env.SYSTEM_MCP_LAW_URL = 'https://law.example.org/mcp';
    expect(getManagedConnectors('de-DE').map((c) => c.key)).toEqual(['gesetze']);
    expect(getManagedConnectors('de-AT')).toEqual([]);
    // No locale = full set: the explicit-mention path must not second-guess a
    // user who typed the connector's name.
    expect(getManagedConnectors().map((c) => c.key)).toEqual(['gesetze']);
  });

  it('marks the connection config as managed so no row write is attempted', () => {
    process.env.SYSTEM_MCP_LAW_URL = 'https://law.example.org/mcp';
    process.env.SYSTEM_MCP_LAW_TOKEN = 'secret';
    const source = sourceByKey('gesetze');
    const config = toSystemConnectionConfig(source!);
    expect(config.managed).toBe(true);
    expect(config.id).toBe('system-gesetze');
    expect(config.authType).toBe('bearer');
  });
});
