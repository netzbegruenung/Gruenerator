/**
 * `@docs` and `@sheets` mentionables read the same `GET /api/docs` list. Both
 * queries mounting together (the composer does) must cost one request, not two.
 */
import { ApiError } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

import { useDocsQuery, useSheetsQuery, useUserNotebooksQuery } from './useMentionablesQuery';

afterEach(() => {
  useChatConfigStore.getState().configure(undefined);
});

describe('docs and sheets mentionables', () => {
  it('share one GET /api/docs', async () => {
    const spy = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            { id: 'a', title: 'Doc', document_subtype: 'blank' },
            { id: 'b', title: 'Sheet', document_subtype: 'sheets' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    useChatConfigStore.getState().configure({ fetch: spy });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => ({ docs: useDocsQuery(), sheets: useSheetsQuery() }), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.docs.isSuccess).toBe(true);
      expect(result.current.sheets.isSuccess).toBe(true);
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.docs.data?.map((d) => d.id)).toEqual(['a']);
    expect(result.current.sheets.data?.map((d) => d.id)).toEqual(['b']);
  });
});

describe('user notebooks mentionable', () => {
  const makeWrapper = (queryClient: QueryClient) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };

  it('reads the own list through the host fetcher; only /shared goes out itself', async () => {
    const spy = vi.fn((url: string) =>
      url.endsWith('/api/auth/notebook-collections/shared')
        ? Promise.resolve(
            new Response(JSON.stringify({ collections: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        : Promise.reject(new Error('must not fetch the own list'))
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The host's own cache entry, fetched once and shared with the mention hook.
    const hostFetch = vi.fn(() => Promise.resolve([{ id: 'n1', name: 'Klima' }]));
    const hostKey = ['notebookCollections', 'u1'];
    useChatConfigStore.getState().configure({
      fetch: spy,
      fetchUserNotebooks: () =>
        queryClient.fetchQuery({ queryKey: hostKey, queryFn: hostFetch, staleTime: 60_000 }),
    });

    await queryClient.fetchQuery({ queryKey: hostKey, queryFn: hostFetch, staleTime: 60_000 });
    const { result } = renderHook(() => useUserNotebooksQuery(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((n) => n.id)).toEqual(['n1']);
    expect(hostFetch).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('resolves an unauthorized host fetch to an empty list', async () => {
    // Logged out: the host's own list and the plain /shared request both 401.
    useChatConfigStore.getState().configure({
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        ),
      fetchUserNotebooks: () => Promise.reject(new ApiError(401, 'Unauthorized')),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUserNotebooksQuery(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('falls back to GET /api/auth/notebook-collections without a host fetcher', async () => {
    const spy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ collections: [{ id: 'n2', name: 'Verkehr' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    useChatConfigStore.getState().configure({ fetch: spy });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUserNotebooksQuery(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Own list and /shared; the same row from both is listed once.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.data?.map((n) => n.id)).toEqual(['n2']);
  });
});
