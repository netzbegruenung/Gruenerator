import { type TransformedCollection } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { useNotebookCollection } from './useNotebookCollection';

const ENDPOINT = 'http://localhost/api/auth/notebook-collections/:slugOrId';
const ID = '11111111-2222-3333-4444-555555555555';
const SLUG = 'presseschau-Ab3xK9';

const collection = (over: Partial<TransformedCollection> = {}): TransformedCollection => ({
  id: ID,
  user_id: 'user-1',
  name: 'Presseschau',
  description: null,
  custom_prompt: null,
  selection_mode: 'documents',
  auto_sync: false,
  remove_missing_on_sync: false,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  documents: [],
  document_count: 0,
  wolke_share_links: [],
  has_wolke_sources: false,
  documents_from_wolke: 0,
  slug_suffix: 'Ab3xK9',
  indexing_state: 'ready',
  ...over,
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

function setup(seed?: { key: readonly unknown[]; list: TransformedCollection[] }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) queryClient.setQueryData(seed.key, seed.list);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return wrapper;
}

describe('useNotebookCollection', () => {
  it('renders from the own list at once while the request still confirms access', async () => {
    let requested: string | null = null;
    server.use(
      http.get(ENDPOINT, ({ params }) => {
        requested = params.slugOrId as string;
        return HttpResponse.json({ success: true, collection: collection({ name: 'Frisch' }) });
      })
    );
    const wrapper = setup({ key: ['notebookCollections', 'user-1'], list: [collection()] });

    const { result } = renderHook(() => useNotebookCollection(SLUG), { wrapper });

    // First render: the list entry, matched by the slug's suffix — no loading state.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.collection?.name).toBe('Presseschau');

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(requested).toBe(SLUG);
    expect(result.current.data?.collection?.name).toBe('Frisch');
  });

  it('matches a shared-list entry by its UUID', () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json({ success: true, collection: collection() }))
    );
    const wrapper = setup({ key: ['notebookCollections', 'shared'], list: [collection()] });

    const { result } = renderHook(() => useNotebookCollection(ID), { wrapper });

    expect(result.current.data?.collection?.id).toBe(ID);
  });

  it('never borrows from the public list', () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json({ success: true, collection: collection() }))
    );
    const wrapper = setup({ key: ['notebookCollections', 'public'], list: [collection()] });

    const { result } = renderHook(() => useNotebookCollection(SLUG), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('replaces the list entry with the access error once the server refuses', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ error: 'nein' }, { status: 403 })));
    const wrapper = setup({ key: ['notebookCollections', 'user-1'], list: [collection()] });

    const { result } = renderHook(() => useNotebookCollection(SLUG), { wrapper });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data).toEqual({ collection: null, error: 'forbidden' });
  });
});
