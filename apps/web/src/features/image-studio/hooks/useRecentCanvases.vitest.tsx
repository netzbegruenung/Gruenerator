import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useRecentCanvases } from './useRecentCanvases';

const ENDPOINT = 'http://localhost/api/canvas';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useRecentCanvases (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('returns the canvas list on a 200 response', async () => {
    // A whole row, not the three fields the assertions read: the canvas client
    // validates its responses against `canvasListItemSchema`, so a stub that
    // skips required columns no longer stands in for what the endpoint sends.
    const canvases = [
      {
        id: 'c1',
        title: 'Sharepic 1',
        template_type: 'sharepic',
        created_by: 'u1',
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-08-02T10:00:00.000Z',
        permissions: null,
        is_public: false,
        base_template_id: null,
        thumbnail_url: null,
        page_count: 1,
        format: 'square',
      },
    ];
    server.use(http.get(ENDPOINT, () => HttpResponse.json(canvases)));

    const { result } = renderHook(() => useRecentCanvases(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(canvases);
  });

  it('surfaces isError when the endpoint returns 401', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 }))
    );

    const { result } = renderHook(() => useRecentCanvases(true), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not fetch when disabled', async () => {
    let requestCount = 0;
    server.use(
      http.get(ENDPOINT, () => {
        requestCount += 1;
        return HttpResponse.json([]);
      })
    );

    const { result } = renderHook(() => useRecentCanvases(false), { wrapper });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
    expect(requestCount).toBe(0);
  });
});
