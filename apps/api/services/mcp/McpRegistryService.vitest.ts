import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('../../config/env.js', () => ({ env: h.env }));

import { McpRegistryService, seedConnectionHints } from './McpRegistryService.js';

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
      expect(entry).not.toHaveProperty('clientEnv');
    }
    expect(seedConnectionHints('https://mapstools.googleapis.com/mcp').keyHeader).toBe(
      'X-Goog-Api-Key'
    );
    expect(seedConnectionHints('https://example.com/mcp')).toEqual({});
  });
});

describe('McpRegistryService — connectors that need our own app', () => {
  it('lists Zoom only once its Marketplace app is configured', async () => {
    const titles = async () => (await McpRegistryService.list({})).recommended.map((e) => e.title);
    expect(await titles()).not.toContain('Zoom');

    h.env.ZOOM_MCP_CLIENT_ID = 'zoom-cid';
    h.env.ZOOM_MCP_CLIENT_SECRET = 'zoom-secret';
    try {
      expect(await titles()).toContain('Zoom');
    } finally {
      delete h.env.ZOOM_MCP_CLIENT_ID;
      delete h.env.ZOOM_MCP_CLIENT_SECRET;
    }
  });

  it('lists Canva regardless — it can still try dynamic registration', async () => {
    const { recommended } = await McpRegistryService.list({});
    expect(recommended.map((e) => e.title)).toContain('Canva');
  });
});
