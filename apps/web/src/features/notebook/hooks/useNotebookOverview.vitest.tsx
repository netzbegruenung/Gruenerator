import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { type NotebookOverview, useNotebookOverview } from './useNotebookOverview';

const ENDPOINT = 'http://localhost/api/auth/notebook/collections/:id/overview';
const ID = 'grundsatz-system';
const STORAGE_KEY = `gruenerator_notebook_overview:v1:${ID}`;
const HOUR = 60 * 60 * 1000;

// Only identity matters here; the page renders the real shape.
const overview = (computedAt: string) => ({ collectionId: ID, computedAt }) as NotebookOverview;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});
beforeEach(() => localStorage.clear());
afterEach(() => server.resetHandlers());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const persist = (data: NotebookOverview, ageMs: number) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ timestamp: Date.now() - ageMs, data }));

describe('useNotebookOverview — persisted across reloads', () => {
  it('stores what it fetched', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json(overview('fresh'))));

    const { result } = renderHook(() => useNotebookOverview(ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { data?: unknown };
    expect(stored.data).toEqual(overview('fresh'));
  });

  it('paints a recent copy at once and does not refetch it', () => {
    let calls = 0;
    server.use(
      http.get(ENDPOINT, () => {
        calls += 1;
        return HttpResponse.json(overview('server'));
      })
    );
    persist(overview('stored'), 10 * 60 * 1000);

    const { result } = renderHook(() => useNotebookOverview(ID), { wrapper });

    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toEqual(overview('stored'));
    expect(result.current.isFetching).toBe(false);
    expect(calls).toBe(0);
  });

  it('shows an hour-old copy while refreshing it in the background', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json(overview('server'))));
    persist(overview('stored'), 2 * HOUR);

    const { result } = renderHook(() => useNotebookOverview(ID), { wrapper });

    expect(result.current.data).toEqual(overview('stored'));
    await waitFor(() => expect(result.current.data).toEqual(overview('server')));
  });

  it('ignores a copy older than the server cache, and a broken one', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json(overview('server'))));
    persist(overview('stored'), 13 * HOUR);

    const { result } = renderHook(() => useNotebookOverview(ID), { wrapper });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(overview('server')));

    localStorage.setItem(STORAGE_KEY, '{not json');
    const broken = renderHook(() => useNotebookOverview(ID), { wrapper });
    expect(broken.result.current.isPending).toBe(true);
  });
});
