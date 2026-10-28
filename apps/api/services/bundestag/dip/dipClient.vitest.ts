import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DipClient, type DipVorgang } from './dipClient.js';

const fetchMock = vi.fn();

/** Antwort wie die DIP-API sie schickt: JSON-Body, Status frei wählbar. */
function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Die URL des n-ten Aufrufs; `fetch` bekommt hier immer eine `URL`. */
function calledUrl(call = 0): URL {
  const arg = fetchMock.mock.calls[call]?.[0] as URL;
  return arg;
}

const FAST = { pacingMs: 0, rateLimitCooldownMs: 0 };

describe('DipClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setzt ein f.id-Array als wiederholten Parameter (ODER in DIP)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ numFound: 0, documents: [] }));

    await new DipClient('key', FAST).list('vorgang', {
      'f.id': [281921, '283611'],
      'f.wahlperiode': 21,
    });

    const url = calledUrl();
    expect(url.searchParams.getAll('f.id')).toEqual(['281921', '283611']);
    expect(url.searchParams.get('f.wahlperiode')).toBe('21');
    expect(url.searchParams.get('apikey')).toBe('key');
    expect(url.searchParams.get('format')).toBe('json');
  });

  it('setzt ein Deskriptor-Array als wiederholten Parameter (UND in DIP)', async () => {
    fetchMock.mockResolvedValueOnce(respond({ numFound: 0, documents: [] }));

    await new DipClient('key', FAST).list('vorgang', {
      'f.deskriptor': ['Klimaschutz', 'Verkehr'],
    });

    expect(calledUrl().searchParams.getAll('f.deskriptor')).toEqual(['Klimaschutz', 'Verkehr']);
  });

  it('holt mit list genau eine Seite und liefert numFound, cursor und documents', async () => {
    const vorgang: DipVorgang = {
      id: '281921',
      titel: 'Gesetz zur Änderung des Klimaschutzgesetzes',
      deskriptor: [{ name: 'Klimaschutz', typ: 'Sachbegriffe' }],
      sachgebiet: ['Umwelt'],
      initiative: ['Bundesregierung'],
    };
    fetchMock.mockResolvedValueOnce(respond({ numFound: 17, cursor: 'AoE', documents: [vorgang] }));

    const page = await new DipClient('key', FAST).list<DipVorgang>('vorgang', { 'f.id': 281921 });

    expect(page).toEqual({ numFound: 17, cursor: 'AoE', documents: [vorgang] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl().pathname).toBe('/api/v1/vorgang');
  });

  it('liefert bei fehlenden Feldern numFound 0, cursor null und leere documents', async () => {
    fetchMock.mockResolvedValueOnce(respond({}));

    const page = await new DipClient('key', FAST).list('drucksache', {});

    expect(page).toEqual({ numFound: 0, cursor: null, documents: [] });
  });

  it('wirft bei einem 429 nach maxAttempts, ohne weiter zu versuchen', async () => {
    fetchMock.mockImplementation(async () => respond({}, 429));

    const client = new DipClient('key', { ...FAST, maxAttempts: 2 });

    await expect(client.list('vorgang', {})).rejects.toThrow('DIP rate limit persists on vorgang');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('blättert in forEachPage weiter und hält am unveränderten Cursor an', async () => {
    fetchMock
      .mockResolvedValueOnce(respond({ cursor: 'A', documents: [{ id: '1' }] }))
      .mockResolvedValueOnce(respond({ cursor: 'B', documents: [{ id: '2' }] }))
      .mockResolvedValueOnce(respond({ cursor: 'B', documents: [{ id: '3' }] }));
    const seen: string[][] = [];

    await new DipClient('key', FAST).forEachPage<{ id: string }>(
      'drucksache-text',
      { 'f.wahlperiode': 21 },
      async (documents) => {
        seen.push(documents.map((d) => d.id));
      }
    );

    expect(seen).toEqual([['1'], ['2'], ['3']]);
    expect(calledUrl(1).searchParams.get('cursor')).toBe('A');
    expect(calledUrl(2).searchParams.get('cursor')).toBe('B');
  });

  it('hält den Abstand pacingMs auch bei gleichzeitigen Aufrufen ein', async () => {
    vi.useFakeTimers();
    try {
      const times: number[] = [];
      fetchMock.mockImplementation(() => {
        times.push(Date.now());
        return Promise.resolve(respond({ numFound: 0, documents: [] }));
      });
      const client = new DipClient('key', { pacingMs: 1000, rateLimitCooldownMs: 0 });
      // Erster Aufruf setzt den Takt; zwei weitere laufen gleichzeitig.
      const first = client.list('vorgang', {});
      await vi.advanceTimersByTimeAsync(0);
      const both = Promise.all([client.list('vorgang', {}), client.list('vorgang', {})]);
      await vi.advanceTimersByTimeAsync(5000);
      await first;
      await both;
      expect(times).toHaveLength(3);
      expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(1000);
      expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});
