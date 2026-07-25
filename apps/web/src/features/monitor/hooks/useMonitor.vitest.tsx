import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useMonitorHistory, usePollParliaments } from './useMonitor';

const HISTORY_ENDPOINT = 'http://localhost/api/monitor/history';
const PARLIAMENTS_ENDPOINT = 'http://localhost/api/monitor/polls/parliaments';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useMonitorHistory (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('returns the history entries on a 200 response', async () => {
    const entries = [{ date: '2026-07-20', topics: [] }];
    server.use(http.get(HISTORY_ENDPOINT, () => HttpResponse.json(entries)));

    const { result } = renderHook(() => useMonitorHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(entries);
  });

  it('surfaces isError when the endpoint returns 500', async () => {
    server.use(
      http.get(HISTORY_ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 }))
    );

    const { result } = renderHook(() => useMonitorHistory(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('requests the given number of days', async () => {
    let seenDays: string | null = null;
    server.use(
      http.get(HISTORY_ENDPOINT, ({ request }) => {
        seenDays = new URL(request.url).searchParams.get('days');
        return HttpResponse.json([]);
      })
    );

    const { result } = renderHook(() => useMonitorHistory(14), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenDays).toBe('14');
  });
});

describe('usePollParliaments (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('returns an empty array gracefully', async () => {
    server.use(http.get(PARLIAMENTS_ENDPOINT, () => HttpResponse.json([])));

    const { result } = renderHook(() => usePollParliaments(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces isError when the endpoint returns 404', async () => {
    server.use(
      http.get(PARLIAMENTS_ENDPOINT, () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 })
      )
    );

    const { result } = renderHook(() => usePollParliaments(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
