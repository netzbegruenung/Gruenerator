import { describe, expect, it } from 'vitest';

import { McpRegistryService } from './McpRegistryService.js';

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
