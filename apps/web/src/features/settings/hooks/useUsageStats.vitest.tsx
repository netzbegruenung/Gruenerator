import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useUsageStats } from './useUsageStats';

const ENDPOINT = 'http://localhost/api/usage/me';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const SAMPLE_RESPONSE = {
  success: true as const,
  days: 30,
  since: '2026-06-25',
  totals: { requests: 0, inputTokens: 0, outputTokens: 0 },
  daily: [],
  byFeature: [],
  byModel: [],
};

describe('useUsageStats (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('returns usage stats on a 200 response', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json(SAMPLE_RESPONSE)));

    const { result } = renderHook(() => useUsageStats(30), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SAMPLE_RESPONSE);
  });

  it('surfaces isError when the endpoint returns 500', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));

    const { result } = renderHook(() => useUsageStats(30), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('requests the given number of days', async () => {
    let seenDays: string | null = null;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        seenDays = new URL(request.url).searchParams.get('days');
        return HttpResponse.json(SAMPLE_RESPONSE);
      })
    );

    const { result } = renderHook(() => useUsageStats(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenDays).toBe('7');
  });
});
