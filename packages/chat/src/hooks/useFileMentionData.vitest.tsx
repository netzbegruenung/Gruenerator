/**
 * The file-mention queries' endpoints and their failure behaviour.
 *
 * `useCombinedContentQuery` requested `/api/auth/documents/combined-content`
 * for months. The documents router hangs off `/api/documents` and the
 * authRouter has no `documents` branch, so it 404'd on every call — and
 * `if (!response.ok) return { documents: [], texts: [] }` turned that into a
 * successful empty payload, which every consumer renders exactly like "you
 * have no files". These tests pin both halves: the path, and that a failed
 * request reaches React Query as an error.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';

import { useCombinedContentQuery, useNotebookCollectionsQuery } from './useFileMentionData';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Installs a spy as the chat config's fetch and returns it. */
function installFetch(impl: (url: string) => Response) {
  const spy = vi.fn((url: string) => Promise.resolve(impl(url)));
  useChatConfigStore.getState().configure({ fetch: spy });
  return spy;
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(() => {
  useChatConfigStore.getState().configure(undefined);
});

describe('useCombinedContentQuery', () => {
  it('requests the documents router, not /api/auth', async () => {
    const spy = installFetch(() =>
      jsonResponse({ success: true, data: { documents: [], texts: [] } })
    );

    const { result } = renderHook(() => useCombinedContentQuery(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledWith('/api/documents/combined-content');
  });

  it('unwraps the endpoint envelope into documents and texts', async () => {
    installFetch(() =>
      jsonResponse({
        success: true,
        data: {
          documents: [{ id: 'd1', filename: 'antrag.pdf', created_at: '2026-08-01' }],
          texts: [{ id: 't1', title: 'Rede', document_type: 'speech', word_count: 12 }],
        },
      })
    );

    const { result } = renderHook(() => useCombinedContentQuery(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.documents).toEqual([
      {
        id: 'd1',
        title: 'antrag.pdf',
        filename: 'antrag.pdf',
        sourceType: undefined,
        createdAt: '2026-08-01',
        contentPreview: undefined,
      },
    ]);
    expect(result.current.data?.texts[0]).toMatchObject({ id: 't1', title: 'Rede', wordCount: 12 });
  });

  it('fails loudly on a 404 instead of resolving to an empty list', async () => {
    installFetch(() => new Response('Not Found', { status: 404 }));

    const { result } = renderHook(() => useCombinedContentQuery(true), { wrapper });
    // The hook pins `retry: 1`, which outranks the wrapper's default — so the
    // error only settles after one backoff round.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe('HTTP 404');
  });

  it('stays idle while the panel is closed', () => {
    const spy = installFetch(() => jsonResponse({ success: true, data: {} }));
    renderHook(() => useCombinedContentQuery(false), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });
});

/** A list entry with every field `mentionCollectionSchema` requires. */
function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Wahlprogramm',
    description: null,
    document_count: 1,
    documents: [{ id: 'd1', title: 'Antrag', created_at: '2026-08-01', status: 'completed' }],
    ...overrides,
  };
}

describe('useNotebookCollectionsQuery', () => {
  it('requests the contracted notebook-collections path', async () => {
    const spy = installFetch(() => jsonResponse({ collections: [] }));

    const { result } = renderHook(() => useNotebookCollectionsQuery(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledWith('/api/auth/notebook-collections');
  });

  it('carries the readiness the server derived', async () => {
    installFetch(() => jsonResponse({ collections: [collection({ indexing_state: 'indexing' })] }));

    const { result } = renderHook(() => useNotebookCollectionsQuery(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]?.indexingState).toBe('indexing');
  });

  it('derives readiness itself when the backend predates the field', async () => {
    installFetch(() =>
      jsonResponse({
        collections: [
          collection({
            documents: [
              { id: 'd1', title: 'Antrag', created_at: '2026-08-01', status: 'uploaded' },
            ],
          }),
        ],
      })
    );

    const { result } = renderHook(() => useNotebookCollectionsQuery(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]?.indexingState).toBe('indexing');
  });

  it('surfaces a payload that does not match the contract as an error', async () => {
    // Not an empty list: an unreadable answer renders identically to "you have
    // no notebooks", which is the failure this hook was already bitten by once.
    installFetch(() => jsonResponse({ collections: [{ id: 'c1' }] }));

    const { result } = renderHook(() => useNotebookCollectionsQuery(true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    expect(result.current.data).toBeUndefined();
  });
});
