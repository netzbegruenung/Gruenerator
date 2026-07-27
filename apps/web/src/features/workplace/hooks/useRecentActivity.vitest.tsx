import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useRecentActivity } from './useRecentActivity';

// The contracts client strips the leading `/api` and issues the request relative
// to the axios baseURL. Point baseURL at an absolute origin so MSW can match a
// deterministic URL (http://localhost/api/recent-activity).
const ENDPOINT = 'http://localhost/api/recent-activity';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function wrapper({ children }: { children: ReactNode }) {
  // Retries off so a 500 surfaces as isError immediately.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useRecentActivity (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('returns the items array on a 200 response', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ items: [] })));

    const { result } = renderHook(() => useRecentActivity(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces isError when the endpoint returns 500', async () => {
    // The queryFn throws on any non-200 status — pin that the error path is wired,
    // not silently swallowed into a success with undefined data.
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    const { result } = renderHook(() => useRecentActivity(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('requests the backend maximum (limit=30)', async () => {
    let seenLimit: string | null = null;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        seenLimit = new URL(request.url).searchParams.get('limit');
        return HttpResponse.json({ items: [] });
      })
    );

    const { result } = renderHook(() => useRecentActivity(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenLimit).toBe('30');
  });
});
