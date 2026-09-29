import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../../test/msw-server';

import { useNotebookHub } from './useNotebookHub';

const BASE = 'http://localhost/api/auth/notebook-collections';

const collection = {
  id: 'nb-1',
  user_id: 'u1',
  name: 'Kreistag',
  description: 'Alles zur Sitzung',
  custom_prompt: 'Antworte knapp.',
  selection_mode: 'documents',
  auto_sync: false,
  remove_missing_on_sync: false,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  documents: [],
  document_count: 0,
  wolke_share_links: [],
  has_wolke_sources: false,
  documents_from_wolke: 0,
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => server.resetHandlers());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function loaded() {
  server.use(http.get(`${BASE}/nb-1`, () => HttpResponse.json({ success: true, collection })));
  const hook = renderHook(() => useNotebookHub('nb-1'), { wrapper });
  await waitFor(() => expect(hook.result.current.collection).not.toBeNull());
  return hook;
}

describe('useNotebookHub (MSW)', () => {
  it('hängt Dokumente an, ohne die Menge zu ersetzen', async () => {
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/nb-1/documents`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, added: 2, document_count: 2 });
      })
    );
    const { result } = await loaded();

    await act(() => result.current.addDocuments(['d1', 'd2']));

    expect(body).toEqual({ document_ids: ['d1', 'd2'] });
  });

  it('schickt bei einer Label-Änderung Beschreibung und Prompt mit', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.put(`${BASE}/nb-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, message: 'ok' });
      })
    );
    const { result } = await loaded();

    await act(() => result.current.saveMeta({ labels: ['Presse'] }));

    // Die Update-Route überschreibt, was fehlt — ohne diese Felder wären
    // Beschreibung und Prompt nach jedem Label-Klick weg.
    expect(body).toMatchObject({
      name: 'Kreistag',
      description: 'Alles zur Sitzung',
      custom_prompt: 'Antworte knapp.',
      labels: ['Presse'],
    });
    expect(body).not.toHaveProperty('document_ids');
  });

  it('meldet die Fehlermeldung des Servers', async () => {
    server.use(
      http.post(`${BASE}/nb-1/wolke`, () =>
        HttpResponse.json(
          { error: 'Das sieht nicht nach einem Nextcloud-Freigabelink aus.' },
          { status: 400 }
        )
      )
    );
    const { result } = await loaded();

    await expect(
      result.current.attachWolke({ url: 'https://example.org', includeSubfolders: true })
    ).rejects.toThrow('Das sieht nicht nach einem Nextcloud-Freigabelink aus.');
  });
});
