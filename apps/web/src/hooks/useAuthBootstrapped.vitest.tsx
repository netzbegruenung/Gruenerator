import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authStatusQueryOptions } from './useAuth';
import { useAuthBootstrap } from './useAuthBootstrapped';

const KEY = authStatusQueryOptions.queryKey;

function setup(gcTime?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useAuthBootstrap(), { wrapper }) };
}

afterEach(() => vi.restoreAllMocks());

describe('useAuthBootstrap', () => {
  it('logs no missing-queryFn error across renders (#3500)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, rerender } = setup();
    await act(async () => {
      client.setQueryData(KEY, { isAuthenticated: true });
    });
    rerender();
    expect(error.mock.calls.flat().join(' ')).not.toContain('No queryFn');
  });

  it('is pending until the query answers, then reflects its data', async () => {
    const { client, result } = setup();
    expect(result.current).toEqual({
      isBootstrapped: false,
      isError: false,
      isAuthenticated: false,
    });

    await act(async () => {
      client.setQueryData(KEY, { isAuthenticated: true });
    });
    await waitFor(() =>
      expect(result.current).toEqual({
        isBootstrapped: true,
        isError: false,
        isAuthenticated: true,
      })
    );
  });

  it('keeps the query alive while mounted, even with gcTime 0', async () => {
    const { client, result } = setup(0);
    await act(async () => {
      client.setQueryData(KEY, { isAuthenticated: true });
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('reports an errored probe', async () => {
    const { client, result } = setup();
    await act(() =>
      client
        .fetchQuery({ queryKey: KEY, queryFn: () => Promise.reject(new Error('down')) })
        .catch(() => {})
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isBootstrapped).toBe(true);
  });

  it('leaves the shared queryFn and silent meta on the query', () => {
    const { client, rerender } = setup();
    rerender();
    const query = client.getQueryCache().find({ queryKey: KEY, exact: true });
    expect(query?.options.queryFn).toBe(authStatusQueryOptions.queryFn);
    expect(query?.meta).toEqual({ silent: true });
  });
});
