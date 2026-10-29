import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BundestagCandidate } from '@gruenerator/contracts';

import { type NationalratApi, type NrDocLink } from './filterApi.js';
import { fetchNationalratTexts } from './text.js';

vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: async (url: string) => ({ isValid: true, url: new URL(url) }),
}));

const cand = (ref: string, dipId: string): BundestagCandidate => ({
  ref,
  dipId,
  kind: 'drucksache',
  dokumentnummer: '26 d.B.',
  drucksachetyp: 'Regierungsvorlage',
  titel: 'T',
  datum: '2026-01-01',
  urheber: [],
  pdfUrl: null,
  vorgangId: null,
  vorgangTitel: null,
  abstract: null,
  aktualisiert: null,
  beratung: null,
});

const api = (links: NrDocLink[]): NationalratApi => ({
  gegenstaende: async () => [],
  protokolle: async () => [
    { uri: '/gegenstand/XXVIII/NRSITZ/60', inr: 60, Gesamtprotokoll: '<div></div>' },
  ],
  dokumente: async () => links,
});

const deps = { redis: null, signal: new AbortController().signal };

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
}

afterEach(() => vi.restoreAllMocks());

describe('fetchNationalratTexts', () => {
  it('liest je Dokumentgruppe die HTML-Fassung, nie den Scan, und nur von parlament.gv.at', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        htmlResponse(
          '<html><head><title>Kopf</title></head><body><p>Gesetzestext.</p></body></html>'
        )
      );
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/I26', '/gegenstand/XXVIII/I/26')],
      deps,
      api([
        { gruppe: 'Gesetzestext', link: '/dokument/XXVIII/I/26/imfname_1.pdf', type: 'PDF' },
        { gruppe: 'Gesetzestext', link: '/dokument/XXVIII/I/26/fnameorig_1.html', type: 'HTML' },
      ])
    );
    expect(d).toMatchObject({ textSource: 'html', text: '## Gesetzestext\n\nGesetzestext.' });
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(['https://www.parlament.gv.at/dokument/XXVIII/I/26/fnameorig_1.html']);
  });

  it('meldet ein vorläufiges Protokoll ohne Gesamtprotokoll als fehlend, ohne Abruf', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/NRSITZ60', '/gegenstand/XXVIII/NRSITZ/60')],
      deps,
      api([])
    );
    expect(d).toMatchObject({ textSource: 'missing', text: '' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('liefert den gecachten Text ohne Abruf', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const redis = {
      get: vi.fn(async () => JSON.stringify({ text: 'Inhalt', textSource: 'html' })),
      set: vi.fn(),
    };
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/I26', '/gegenstand/XXVIII/I/26')],
      { ...deps, redis },
      api([])
    );
    expect(d).toMatchObject({ text: 'Inhalt', textSource: 'html' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
