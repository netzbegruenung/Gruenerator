import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useNotebookStats } from './useNotebookStats';

const SINGLE_ENDPOINT = 'http://localhost/api/auth/notebook/collections/col-1/stats';
const MERGED_ENDPOINT = 'http://localhost/api/auth/notebook/stats';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const SAMPLE_STATS = {
  totalDocuments: 3,
  categoryDistribution: [],
  sourceDistribution: [],
  dateRange: { min: null, max: null },
  monthlyActivity: [],
  topWords: [],
  topicDistribution: [],
  topicSampleSize: 0,
  topPersons: [],
};

describe('useNotebookStats (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('fetches single-collection stats when only one collection is given', async () => {
    server.use(http.get(SINGLE_ENDPOINT, () => HttpResponse.json(SAMPLE_STATS)));

    const { result } = renderHook(() => useNotebookStats({ collectionIds: ['col-1'] }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SAMPLE_STATS);
  });

  it('fetches merged stats across multiple collections', async () => {
    let seenCollections: string | null = null;
    server.use(
      http.get(MERGED_ENDPOINT, ({ request }) => {
        seenCollections = new URL(request.url).searchParams.get('collections');
        return HttpResponse.json(SAMPLE_STATS);
      })
    );

    const { result } = renderHook(() => useNotebookStats({ collectionIds: ['col-1', 'col-2'] }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenCollections).toBe('col-1,col-2');
  });

  it('surfaces isError when the endpoint returns 500', async () => {
    server.use(
      http.get(SINGLE_ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 }))
    );

    const { result } = renderHook(() => useNotebookStats({ collectionIds: ['col-1'] }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not fetch when disabled', () => {
    let requestCount = 0;
    server.use(
      http.get(SINGLE_ENDPOINT, () => {
        requestCount += 1;
        return HttpResponse.json(SAMPLE_STATS);
      })
    );

    const { result } = renderHook(
      () => useNotebookStats({ collectionIds: ['col-1'], enabled: false }),
      { wrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(requestCount).toBe(0);
  });
});
