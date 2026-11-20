/**
 * `@docs` and `@sheets` mentionables read the same `GET /api/docs` list. Both
 * queries mounting together (the composer does) must cost one request, not two.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

import { useDocsQuery, useSheetsQuery } from './useMentionablesQuery';

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
