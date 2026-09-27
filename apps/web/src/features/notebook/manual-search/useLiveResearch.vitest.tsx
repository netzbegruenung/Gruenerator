import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useLiveResearch } from './useLiveResearch';

const SEARCH = 'http://localhost/api/research/search';
const NOTEBOOK_SEARCH = 'http://localhost/api/auth/notebook/nb-1/research-search';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function hit(title: string) {
  return {
    document_id: title,
    title,
    source_url: null,
    relevant_content: title,
    similarity_score: 0.9,
    chunk_count: 1,
    top_chunks: [],
  };
}

function response(...titles: string[]) {
  return {
    results: titles.map(hit),
    metadata: { totalResults: titles.length, collections: ['berlin-system'], timeMs: 12 },
  };
}

type Props = { query: string; enabled?: boolean };

function renderLive(initial: Props, notebookId?: string) {
  return renderHook(
    ({ query, enabled = true }: Props) =>
      useLiveResearch({
        query,
        enabled,
        collectionIds: ['berlin-system'],
        mode: 'hybrid',
        sortBy: 'relevance',
        ...(notebookId ? { notebookId } : {}),
      }),
    { wrapper, initialProps: initial }
  );
}

describe('useLiveResearch (MSW)', () => {
  afterEach(() => server.resetHandlers());

  it('does not search a query that is still being typed', async () => {
    let calls = 0;
    server.use(
      http.post(SEARCH, () => {
        calls += 1;
        return HttpResponse.json(response('x'));
      })
    );
    const { result } = renderLive({ query: 'Mi' });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
    expect(result.current.results).toEqual([]);
    expect(result.current.isPending).toBe(false);
  });

  it('lists the hits, scoped to the notebook’s collections', async () => {
    let body: unknown = null;
    server.use(
      http.post(SEARCH, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(response('Mietendeckel'));
      })
    );
    const { result } = renderLive({ query: '  Mieten ' });
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]?.title).toBe('Mietendeckel');
    expect(body).toMatchObject({ query: 'Mieten', collectionIds: ['berlin-system'] });
  });

  it('uses the user notebook’s own route when it has one', async () => {
    server.use(http.post(NOTEBOOK_SEARCH, () => HttpResponse.json(response('Protokoll'))));
    const { result } = renderLive({ query: 'Protokoll' }, 'nb-1');
    await waitFor(() => expect(result.current.results[0]?.title).toBe('Protokoll'));
  });

  it('reports a failed search', async () => {
    server.use(http.post(SEARCH, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    const { result } = renderLive({ query: 'Radwege' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.results).toEqual([]);
  });

  it('never lets a slow answer for an older keystroke replace a newer one', async () => {
    server.use(
      http.post(SEARCH, async ({ request }) => {
        const { query } = (await request.json()) as { query: string };
        if (query === 'Kli') await delay(150);
        return HttpResponse.json(response(`Treffer für ${query}`));
      })
    );
    const { result, rerender } = renderLive({ query: 'Kli' });
    rerender({ query: 'Klima' });

    await waitFor(() => expect(result.current.results[0]?.title).toBe('Treffer für Klima'));
    await new Promise((r) => setTimeout(r, 250));
    expect(result.current.results[0]?.title).toBe('Treffer für Klima');
  });

  it('shows nothing while switched off', () => {
    const { result } = renderLive({ query: 'Klima', enabled: false });
    expect(result.current.results).toEqual([]);
    expect(result.current.isPending).toBe(false);
  });
});
