import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getSourcesForIntent,
  getSystemMcpSources,
  isSystemIntentAvailable,
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

  it('reise umbrella mounts bahn + hotel + wetter (configured subset)', () => {
    process.env.SYSTEM_MCP_DB_URL = 'https://db.example.org/mcp';
    process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example.org/mcp';
    // wetter NOT configured → reise mounts only the configured pair.
    expect(getSourcesForIntent('reise').map((s) => s.key)).toEqual(['bahn', 'hotel']);
    expect(isSystemIntentAvailable('reise')).toBe(true);

    process.env.SYSTEM_MCP_WEATHER_URL = 'https://meteo.example.org/mcp';
    expect(getSourcesForIntent('reise').map((s) => s.key)).toEqual(['bahn', 'hotel', 'wetter']);
    // single-source intents stay single-source.
    expect(getSourcesForIntent('bahn').map((s) => s.key)).toEqual(['bahn']);
    expect(getSourcesForIntent('hotel').map((s) => s.key)).toEqual(['hotel']);
    expect(getSourcesForIntent('wetter').map((s) => s.key)).toEqual(['wetter']);
  });

  it('reise stays available while ANY of its sources is configured', () => {
    process.env.SYSTEM_MCP_TRIVAGO_URL = 'https://trivago.example.org/mcp';
    expect(isSystemIntentAvailable('reise')).toBe(true);
    expect(isSystemIntentAvailable('bahn')).toBe(false);
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
    expect(
      getSourcesForIntent('reise', 'de-DE')
        .map((s) => s.key)
        .sort()
    ).toEqual(['bahn', 'hotel', 'wetter']);
    expect(getSourcesForIntent('bahn', 'de-DE')).toHaveLength(1);
    expect(getSourcesForIntent('news', 'de-DE')).toHaveLength(1);
  });

  it('drops only the German-only sources for an Austrian user', () => {
    allConfigured();
    // The bug this prevents: an Austrian planning Wien→Graz was handed Deutsche
    // Bahn IRIS tools, because the gate was per intent and `reise` is not
    // German-only as a whole.
    expect(
      getSourcesForIntent('reise', 'de-AT')
        .map((s) => s.key)
        .sort()
    ).toEqual(['hotel', 'wetter']);
    expect(getSourcesForIntent('bahn', 'de-AT')).toHaveLength(0);
    expect(getSourcesForIntent('news', 'de-AT')).toHaveLength(0);
    // Global sources are untouched.
    expect(getSourcesForIntent('wetter', 'de-AT')).toHaveLength(1);
    expect(getSourcesForIntent('hotel', 'de-AT')).toHaveLength(1);
  });

  it('keeps the full set when no locale is given (health checks, catalogs)', () => {
    allConfigured();
    expect(getSourcesForIntent('reise')).toHaveLength(3);
    expect(getSourcesForIntent('bahn')).toHaveLength(1);
  });

  it('reports availability per locale', () => {
    allConfigured();
    expect(isSystemIntentAvailable('bahn', 'de-DE')).toBe(true);
    expect(isSystemIntentAvailable('bahn', 'de-AT')).toBe(false);
    // `reise` survives for Austria — with hotel and weather, without the train.
    expect(isSystemIntentAvailable('reise', 'de-AT')).toBe(true);
  });

  it('derives DE_ONLY_SYSTEM_INTENTS instead of hand-listing it', async () => {
    const { DE_ONLY_SYSTEM_INTENTS } = await import('./systemMcpServers.js');
    expect([...DE_ONLY_SYSTEM_INTENTS].sort()).toEqual(['bahn', 'news']);
    // `reise` must NOT be in here: it still has sources for Austria, so
    // degrading the whole intent to web would throw away hotel and weather.
    expect(DE_ONLY_SYSTEM_INTENTS.has('reise' as never)).toBe(false);
  });
});
