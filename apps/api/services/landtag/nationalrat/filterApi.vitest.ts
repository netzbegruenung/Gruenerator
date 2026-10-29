import { afterEach, describe, expect, it, vi } from 'vitest';

import { NationalratFilterApi } from './filterApi.js';

vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: async (url: string) => ({ isValid: true, url: new URL(url) }),
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const group = (title: string, link: string) => ({
  title,
  documents: [{ link, type: 'HTML' }],
});

afterEach(() => vi.restoreAllMocks());

describe('NationalratFilterApi.dokumente', () => {
  const signal = new AbortController().signal;

  it('liest die Dokumente eines Gegenstands, dessen Seite ein Objekt ist', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({ content: { documents: [group('Gesetzestext', '/dokument/XXVIII/I/26/a.html')] } })
    );
    expect(await new NationalratFilterApi().dokumente('/gegenstand/XXVIII/I/26', signal)).toEqual([
      { gruppe: 'Gesetzestext', link: '/dokument/XXVIII/I/26/a.html', type: 'HTML' },
    ]);
  });

  it('liest bei einer Sitzung, deren Seite eine Liste ist, auch das vorläufige Protokoll', async () => {
    // Gemessen am 30.10.2026 (103. Sitzung): `content` ist eine Liste, das Protokoll steht in `stdocuments`.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({
        content: [
          {
            documents: [group('Zuweisungsmitteilung', '/dokument/XXVIII/NRSITZ/103/z.html')],
            stdocuments: [
              group(
                'Inhaltsverzeichnis der 103. Sitzung',
                '/dokument/XXVIII/NRSITZ/103/A_-_00.html'
              ),
            ],
          },
          { current_session: {} },
        ],
      })
    );
    const links = await new NationalratFilterApi().dokumente(
      '/gegenstand/XXVIII/NRSITZ/103',
      signal
    );
    expect(links.map((l) => l.gruppe)).toEqual([
      'Zuweisungsmitteilung',
      'Inhaltsverzeichnis der 103. Sitzung',
    ]);
  });

  it('liest die Reden einer Sitzung ohne Sprungmarke, ohne Doppelte, in Tagesordnungsfolge', async () => {
    // Form gemessen am 30.10.2026 (103. Sitzung): Spalte 3 von `stages[].reden.data.rows`.
    const rede = (url: string, title: string) => ['<a>Name</a>', 'Pro', [{ url, title }], {}];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({
        content: [
          {
            stages: [
              { text: 'Tagesordnung' },
              {
                reden: {
                  data: {
                    rows: [
                      rede('/dokument/XXVIII/NRSITZ/103/A_-_10_43_57_1.html#16', '10:43:57 - A'),
                      rede('/dokument/XXVIII/NRSITZ/103/A_-_10_43_57_1.html#17', '10:43:57 - A'),
                    ],
                  },
                },
              },
              {
                reden: {
                  data: {
                    rows: [rede('/dokument/XXVIII/NRSITZ/103/A_-_12_00_00_2.html', '12:00 - B')],
                  },
                },
              },
            ],
          },
        ],
      })
    );
    expect(await new NationalratFilterApi().reden('/gegenstand/XXVIII/NRSITZ/103', signal)).toEqual(
      [
        { titel: '10:43:57 - A', link: '/dokument/XXVIII/NRSITZ/103/A_-_10_43_57_1.html' },
        { titel: '12:00 - B', link: '/dokument/XXVIII/NRSITZ/103/A_-_12_00_00_2.html' },
      ]
    );
  });

  it('gibt eine leere Liste, wenn die Seite keine Dokumente nennt', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ content: [] }));
    expect(
      await new NationalratFilterApi().dokumente('/gegenstand/XXVIII/NRSITZ/1', signal)
    ).toEqual([]);
  });
});
