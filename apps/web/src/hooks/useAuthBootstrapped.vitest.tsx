import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthBootstrap } from './useAuthBootstrapped';

const KEY = ['authStatus'];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useAuthBootstrap(), { wrapper }) };
}

afterEach(() => vi.restoreAllMocks());

describe('useAuthBootstrap', () => {
  it('logs no missing-queryFn error across renders (#3500)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, rerender } = setup();
    act(() => client.setQueryData(KEY, { isAuthenticated: true }));
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

    act(() => client.setQueryData(KEY, { isAuthenticated: true }));
    await waitFor(() =>
      expect(result.current).toEqual({
        isBootstrapped: true,
        isError: false,
        isAuthenticated: true,
      })
    );

    act(() => client.removeQueries({ queryKey: KEY }));
    await waitFor(() => expect(result.current.isBootstrapped).toBe(false));
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

  it("does not overwrite the active query's options", () => {
    const { client, rerender } = setup();
    const queryFn = () => Promise.resolve({ isAuthenticated: false });
    act(() => void client.prefetchQuery({ queryKey: KEY, queryFn, meta: { silent: true } }));
    rerender();
    const query = client.getQueryCache().find({ queryKey: KEY, exact: true });
    expect(query?.options.queryFn).toBe(queryFn);
    expect(query?.meta).toEqual({ silent: true });
  });
});
