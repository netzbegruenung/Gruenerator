import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import {
  mapMonitorCitations,
  useMonitorHistory,
  useMonitorSnapshot,
  usePollParliaments,
  usePollsOverview,
} from './useMonitor';

const HISTORY_ENDPOINT = 'http://localhost/api/monitor/history';
const PARLIAMENTS_ENDPOINT = 'http://localhost/api/monitor/polls/parliaments';
const LATEST_ENDPOINT = 'http://localhost/api/monitor/latest';
const OVERVIEW_ENDPOINT = 'http://localhost/api/monitor/polls/overview';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useMonitorHistory (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('returns the history entries on a 200 response', async () => {
    const entries = [{ date: '2026-07-20', topics: [] }];
    server.use(http.get(HISTORY_ENDPOINT, () => HttpResponse.json(entries)));

    const { result } = renderHook(() => useMonitorHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(entries);
  });

  it('surfaces isError when the endpoint returns 500', async () => {
    server.use(
      http.get(HISTORY_ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 }))
    );

    const { result } = renderHook(() => useMonitorHistory(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('requests the given number of days', async () => {
    let seenDays: string | null = null;
    server.use(
      http.get(HISTORY_ENDPOINT, ({ request }) => {
        seenDays = new URL(request.url).searchParams.get('days');
        return HttpResponse.json([]);
      })
    );

    const { result } = renderHook(() => useMonitorHistory(14), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenDays).toBe('14');
  });
});

describe('useMonitorSnapshot — 404 is an empty state, not an error', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('resolves to null and stays out of the error path when no snapshot exists', async () => {
    // Live on beta 20.08.2026: the hourly refresh never reached that instance,
    // so this endpoint answered 404 forever. Treated as an error it produced
    // three requests every five minutes, each with a toast.
    let calls = 0;
    server.use(
      http.get(LATEST_ENDPOINT, () => {
        calls++;
        return HttpResponse.json({ error: 'No monitor data available yet' }, { status: 404 });
      })
    );

    const { result } = renderHook(() => useMonitorSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(calls).toBe(1);
  });

  it('still fails loudly on a 500', async () => {
    server.use(
      http.get(LATEST_ENDPOINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 }))
    );

    const { result } = renderHook(() => useMonitorSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('monitor errors carry their HTTP status', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  // The app's global retry guard and the toast filter both branch on
  // `err.status`. A bare `new Error(...)` leaves it undefined, so neither fires
  // and every 404 was retried twice and toasted.
  it('exposes status on the thrown error so the retry/toast guards can read it', async () => {
    server.use(
      http.get(PARLIAMENTS_ENDPOINT, () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 })
      )
    );

    const { result } = renderHook(() => usePollParliaments(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { status?: number }).status).toBe(404);
  });
});

describe('usePollsOverview (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('fetches every Bundesland in a single request', async () => {
    let calls = 0;
    let seenCountry: string | null = null;
    server.use(
      http.get(OVERVIEW_ENDPOINT, ({ request }) => {
        calls++;
        seenCountry = new URL(request.url).searchParams.get('country');
        return HttpResponse.json({
          entries: [{ parliament: 'bayern', gruene: 14.5, latestPollDate: '2026-08-15' }],
          fetchedAt: '2026-08-20T00:00:00.000Z',
        });
      })
    );

    const { result } = renderHook(() => usePollsOverview('DE'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toBe(1);
    expect(seenCountry).toBe('DE');
    expect(result.current.data?.entries[0].gruene).toBe(14.5);
  });
});

describe('usePollParliaments (MSW)', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('returns an empty array gracefully', async () => {
    server.use(http.get(PARLIAMENTS_ENDPOINT, () => HttpResponse.json([])));

    const { result } = renderHook(() => usePollParliaments(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces isError when the endpoint returns 404', async () => {
    server.use(
      http.get(PARLIAMENTS_ENDPOINT, () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 })
      )
    );

    const { result } = renderHook(() => usePollParliaments(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

/**
 * `mapMonitorCitations` ist die Naht zwischen dem Vertrag und den beiden
 * Gattern in CitationBadge.tsx:40 / CitationSourcesDisplay.tsx:72. Beide
 * prüfen `chunk_index !== undefined` — deshalb muss ein fehlendes Feld hier
 * FEHLEN und nicht als `undefined` gesetzt sein.
 */
describe('mapMonitorCitations', () => {
  const webCitation = {
    id: '1',
    title: 'Tagesschau: Debatte um das Klimageld',
    url: 'https://www.tagesschau.de/inland/klimageld-100.html',
    snippet: 'Die Bundesregierung diskutiert…',
  };

  it('bildet ein Web-Zitat ohne Dokument-Kennung ab und lässt die Schlüssel weg', () => {
    const [mapped] = mapMonitorCitations([webCitation]);

    expect(mapped).toEqual({
      index: 1,
      document_title: 'Tagesschau: Debatte um das Klimageld',
      source_url: 'https://www.tagesschau.de/inland/klimageld-100.html',
      cited_text: 'Die Bundesregierung diskutiert…',
    });
    expect('document_id' in mapped).toBe(false);
    expect('chunk_index' in mapped).toBe(false);
  });

  it('reicht documentId/chunkIndex als document_id/chunk_index durch', () => {
    const [mapped] = mapMonitorCitations([
      { ...webCitation, documentId: '6d1f1c8e-2b4a-4c5d-8e9f-0a1b2c3d4e5f', chunkIndex: 4 },
    ]);

    expect(mapped.document_id).toBe('6d1f1c8e-2b4a-4c5d-8e9f-0a1b2c3d4e5f');
    expect(mapped.chunk_index).toBe(4);
  });

  it('behält chunk_index 0 — der erste Chunk darf nicht wegfallen', () => {
    const [mapped] = mapMonitorCitations([{ ...webCitation, documentId: 'doc-1', chunkIndex: 0 }]);

    expect(mapped.chunk_index).toBe(0);
    expect('chunk_index' in mapped).toBe(true);
  });

  it('lässt document_id UND chunk_index weg, wenn nur documentId vorliegt', () => {
    // Mit document_id allein baut MONITOR_CITATION_LINK_CONFIG einen
    // Dokumentlink (getDocumentUrl), dessen Kontext sich ohne chunkIndex nie
    // laden lässt — beide Schlüssel gehören zusammen oder gar nicht.
    const [mapped] = mapMonitorCitations([{ ...webCitation, documentId: 'doc-1' }]);

    expect('document_id' in mapped).toBe(false);
    expect('chunk_index' in mapped).toBe(false);
  });

  it('liefert für undefined eine leere Liste', () => {
    expect(mapMonitorCitations(undefined)).toEqual([]);
  });
});
