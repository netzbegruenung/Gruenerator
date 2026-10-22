import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';

import { useOfficeLibrary } from './useOfficeLibrary';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}
const item = (id: string) => ({
  id,
  title: id,
  updated_at: '2026-10-20',
  document_subtype: 'blank',
  content: '',
  creator_name: '',
  access_type: 'owner',
  group_shares: [],
});

describe('useOfficeLibrary', () => {
  it('loads older pages and resets pagination for filters, sorting and searches', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get('http://localhost/api/content/office', ({ request }) => {
        const params = new URL(request.url).searchParams;
        seen.push(params);
        const offset = Number(params.get('offset'));
        return HttpResponse.json({
          items: [item(`document-${offset}`)],
          total: 51,
          offset,
          limit: 50,
          hasMore: offset === 0,
        });
      })
    );
    const { result } = renderHook(() => useOfficeLibrary(true), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(result.current.items.map((entry) => entry.id)).toEqual(['document-0', 'document-50']);
    expect(result.current.hasNextPage).toBe(false);
    act(() => result.current.setType('sheet'));
    await waitFor(() => expect(seen.at(-1)?.get('typ')).toBe('sheet'));
    expect(seen.at(-1)?.get('offset')).toBe('0');
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.setSort('oldest'));
    await waitFor(() => expect(seen.at(-1)?.get('sort')).toBe('oldest'));
    act(() => result.current.setSearchInput('alter Antrag'));
    await waitFor(() => expect(seen.at(-1)?.get('search')).toBe('alter Antrag'));
    expect(seen.at(-1)?.get('offset')).toBe('0');
  });

  it('handles an empty library and server failures distinctly', async () => {
    server.use(
      http.get('http://localhost/api/content/office', () =>
        HttpResponse.json({ items: [], total: 0, offset: 0, limit: 50, hasMore: false })
      )
    );
    const { result } = renderHook(() => useOfficeLibrary(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.total).toBe(0);
    expect(result.current.hasNextPage).toBe(false);
    server.use(
      http.get('http://localhost/api/content/office', () =>
        HttpResponse.json({ error: 'failed' }, { status: 500 })
      )
    );
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
