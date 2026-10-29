import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BundestagCandidate } from '@gruenerator/contracts';

import { type NationalratApi, type NrDocLink, type NrRede } from './filterApi.js';
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

const api = (
  links: NrDocLink[],
  gesamtprotokoll = '<div></div>',
  reden: NrRede[] = []
): NationalratApi => ({
  gegenstaende: async () => [],
  protokolle: async () => [
    { uri: '/gegenstand/XXVIII/NRSITZ/60', inr: 60, Gesamtprotokoll: gesamtprotokoll },
  ],
  dokumente: vi.fn(async () => links),
  reden: vi.fn(async () => reden),
});

const REDEN: NrRede[] = [
  {
    titel: '10:43:57 - Peter Schmiedlechner (FPÖ) - TOP 1 Grüner Bericht',
    link: '/dokument/XXVIII/NRSITZ/60/A_-_10_43_57_1.html',
  },
  {
    titel: '10:50:42 - Olga Voglauer (Grüne) - TOP 1 Grüner Bericht',
    link: '/dokument/XXVIII/NRSITZ/60/A_-_10_50_42_2.html',
  },
];

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

  it('setzt ohne Gesamtprotokoll die Reden zusammen, je Rede mit Titel, in Tagesordnungsfolge', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        htmlResponse(
          String(url).includes('_1.html')
            ? '<html><body><p>Der Bericht zeigt ein Einkommensplus.</p></body></html>'
            : '<html><body><p>Die Biobetriebe brauchen Planungssicherheit.</p></body></html>'
        )
      );
    const seite = api([], '<div></div>', REDEN);
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/NRSITZ60', '/gegenstand/XXVIII/NRSITZ/60')],
      deps,
      seite
    );
    expect(d.textSource).toBe('html');
    expect(d.text).toMatch(/^## Vorläufiges Protokoll \(Reden noch nicht autorisiert\)/);
    expect(d.text).toContain(
      '## 10:43:57 - Peter Schmiedlechner (FPÖ) - TOP 1 Grüner Bericht\n\nDer Bericht zeigt ein Einkommensplus.'
    );
    expect(d.text.indexOf('Schmiedlechner')).toBeLessThan(d.text.indexOf('Voglauer'));
    expect(d.text).toContain('Die Biobetriebe brauchen Planungssicherheit.');
    expect(seite.dokumente).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.map((c) => String(c[0])).sort()).toEqual([
      'https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/60/A_-_10_43_57_1.html',
      'https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/60/A_-_10_50_42_2.html',
    ]);
  });

  it('cacht keine Sitzung, deren Reden nur teilweise zu laden waren', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('_2.html')
        ? new Response('', { status: 503 })
        : htmlResponse('<html><body><p>Wortlaut.</p></body></html>')
    );
    const redis = { get: vi.fn(async () => null), set: vi.fn() };
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/NRSITZ60', '/gegenstand/XXVIII/NRSITZ/60')],
      { ...deps, redis },
      api([], '<div></div>', REDEN)
    );
    expect(d).toMatchObject({ textSource: 'missing', text: '' });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('liest ohne Gesamtprotokoll und ohne Reden das Inhaltsverzeichnis des vorläufigen Protokolls und sagt es', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        htmlResponse(
          '<html><body><p>1. Punkt: Grüner Bericht 2026. Michael Fürtbauer (FPÖ)</p></body></html>'
        )
      );
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/NRSITZ60', '/gegenstand/XXVIII/NRSITZ/60')],
      deps,
      api([
        {
          gruppe: 'Zuweisungsmitteilung für die 60. Sitzung',
          link: '/dokument/XXVIII/NRSITZ/60/fnameorig_1.html',
          type: 'HTML',
        },
        {
          gruppe: 'Inhaltsverzeichnis der 60. Sitzung',
          link: '/dokument/XXVIII/NRSITZ/60/A_-_00_00_00_1.pdf',
          type: 'PDF',
        },
        {
          gruppe: 'Inhaltsverzeichnis der 60. Sitzung',
          link: '/dokument/XXVIII/NRSITZ/60/A_-_00_00_00_1.html',
          type: 'HTML',
        },
      ])
    );
    expect(d.textSource).toBe('html');
    expect(d.text).toMatch(/^## Vorläufiges Protokoll \(nur Inhaltsverzeichnis\)/);
    expect(d.text).toContain('Der Wortlaut der Reden liegt erst mit dem Gesamtprotokoll vor');
    expect(d.text).toContain('Michael Fürtbauer (FPÖ)');
    // Nur das Inhaltsverzeichnis, nicht die Zuweisungsmitteilung derselben Seite.
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/60/A_-_00_00_00_1.html',
    ]);
  });

  it('meldet ein Protokoll ohne Gesamtprotokoll und ohne Inhaltsverzeichnis als fehlend, ohne Abruf', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/NRSITZ60', '/gegenstand/XXVIII/NRSITZ/60')],
      deps,
      api([])
    );
    expect(d).toMatchObject({ textSource: 'missing', text: '' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('liest das Gesamtprotokoll, wo es verlinkt ist, und fragt die Detailseite nicht', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => htmlResponse('<html><body><p>Wortlaut.</p></body></html>'));
    const seite = api([], '<a href="/dokument/XXVIII/NRSITZ/60/fnameorig_9.html">HTML</a>');
    const [d] = await fetchNationalratTexts(
      [cand('NR 28/NRSITZ60', '/gegenstand/XXVIII/NRSITZ/60')],
      deps,
      seite
    );
    expect(d).toMatchObject({ textSource: 'html', text: 'Wortlaut.' });
    expect(seite.dokumente).not.toHaveBeenCalled();
    expect(seite.reden).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/60/fnameorig_9.html',
    ]);
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
