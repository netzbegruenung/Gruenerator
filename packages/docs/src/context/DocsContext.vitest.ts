import { describe, expect, it } from 'vitest';

import { createDocsApiClient, type DocsAdapter } from './DocsContext';

describe('createDocsApiClient', () => {
  it('keeps the HTTP status on a failed response', async () => {
    // Only the members the request path touches.
    const adapter: Pick<DocsAdapter, 'fetch' | 'getApiBaseUrl' | 'onUnauthorized'> = {
      fetch: () => Promise.resolve(new Response('Bad Gateway', { status: 502 })),
      getApiBaseUrl: () => '',
      onUnauthorized: () => false,
    };
    const client = createDocsApiClient(adapter as DocsAdapter);

    await expect(client.get('/docs')).rejects.toMatchObject({ name: 'ApiError', status: 502 });
  });
});
