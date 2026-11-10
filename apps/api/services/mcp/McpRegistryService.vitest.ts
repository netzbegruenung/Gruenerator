import { afterEach, describe, expect, it } from 'vitest';

import { findSeedByUrl, McpRegistryService, seedConnectionHints } from './McpRegistryService.js';

describe('McpRegistryService — Typeform directory entries', () => {
  it('offers OAuth connections for the global and both EU MCP resources', async () => {
    const { recommended } = await McpRegistryService.list({});

    expect(
      recommended
        .filter((entry) => entry.title.startsWith('Typeform'))
        .map(({ title, url, authHint }) => ({ title, url, authHint }))
    ).toEqual([
      {
        title: 'Typeform',
        url: 'https://api.typeform.com/mcp',
        authHint: 'oauth',
      },
      {
        title: 'Typeform (EU – .com)',
        url: 'https://api.eu.typeform.com/mcp',
        authHint: 'oauth',
      },
      {
        title: 'Typeform (EU – .eu)',
        url: 'https://api.typeform.eu/mcp',
        authHint: 'oauth',
      },
    ]);
  });
});

describe('McpRegistryService — auth options', () => {
  it('lists the preferred way first for every curated entry', async () => {
    const { recommended } = await McpRegistryService.list({});
    for (const entry of recommended) expect(entry.authOptions?.[0]).toBe(entry.authHint);
  });

  it('offers OAuth with an API-key alternative where providers take both', async () => {
    const { recommended } = await McpRegistryService.list({});
    const byTitle = new Map(recommended.map((e) => [e.title, e]));
    for (const title of ['Tally', 'Brevo', 'Sally', 'Statista', 'SISTRIX', 'Zapier', 'Todoist']) {
      expect(byTitle.get(title)?.authOptions, title).toEqual(['oauth', 'bearer']);
    }
    expect(byTitle.get('Brevo')?.keyUrl).toBe('https://app.brevo.com/settings/keys/api');
  });

  it('keeps server-only hints off the wire', async () => {
    const { recommended } = await McpRegistryService.list({});
    for (const entry of recommended) {
      expect(entry).not.toHaveProperty('keyHeader');
    }
    expect(seedConnectionHints('https://mapstools.googleapis.com/mcp').keyHeader).toBe(
      'X-Goog-Api-Key'
    );
    expect(seedConnectionHints('https://example.com/mcp')).toEqual({});
  });
});

describe('McpRegistryService — bekannte Konnektoren im Verzeichnis', () => {
  afterEach(() => {
    delete process.env.SYSTEM_MCP_RATEO_URL;
  });

  it('führt eine aktive Quelle als Karte mit registryKey und ohne URL', async () => {
    process.env.SYSTEM_MCP_RATEO_URL = 'https://rateo.example/api/mcp';
    const { recommended } = await McpRegistryService.list({});
    const rateo = recommended.find((e) => e.registryKey === 'rateo');
    expect(rateo).toMatchObject({ title: 'Rateo', url: '', authHint: 'none', recommended: true });
    expect(rateo?.category).toBe('Politik & Verwaltung');
  });

  it('findet sie über die Beschreibung', async () => {
    process.env.SYSTEM_MCP_RATEO_URL = 'https://rateo.example/api/mcp';
    const { recommended } = await McpRegistryService.list({ search: 'bezirksverordneten' });
    expect(recommended.map((e) => e.registryKey ?? null)).toContain('rateo');
  });

  it('lässt eine abgeschaltete Quelle weg (leerer Env-Wert)', async () => {
    // Rateo hat eine eingebaute URL; leer ist sein ausdrückliches „aus".
    process.env.SYSTEM_MCP_RATEO_URL = '';
    const { recommended } = await McpRegistryService.list({});
    expect(recommended.some((e) => e.registryKey === 'rateo')).toBe(false);
  });

  it('ordnet einer Zeile mit leerer URL keinen Verzeichniseintrag zu', () => {
    process.env.SYSTEM_MCP_RATEO_URL = 'https://rateo.example/api/mcp';
    expect(findSeedByUrl('')).toBeNull();
  });
});
