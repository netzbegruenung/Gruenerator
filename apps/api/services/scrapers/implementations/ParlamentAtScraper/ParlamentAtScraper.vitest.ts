import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateContentHash } from '../../../../utils/validation/hash.js';

import type { ParentDoc } from '../../utils/parentStore.js';
import type { Gegenstand, ListRow } from './parlamentClient.js';

const writeParent = vi.fn(
  async (_c: unknown, _s: unknown, parent: ParentDoc) => parent.units.length
);
const scroll = vi.fn();
const setPayload = vi.fn();
const client = {
  listGegenstaende: vi.fn(),
  getGegenstand: vi.fn(),
  getSitzung: vi.fn(),
  getHtml: vi.fn(),
  getBytes: vi.fn(),
  getPersonKlub: vi.fn(),
};

vi.mock('../../../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({ init: async () => {}, client: { scroll, setPayload } }),
}));
vi.mock('../../../mistral/index.js', () => ({ mistralEmbeddingService: { init: async () => {} } }));
vi.mock('../../../pdf/pdfText.js', () => ({
  extractPdfText: async () =>
    'Die Reisekosten betrugen im vierten Quartal 2025 insgesamt 12.345 Euro. '.repeat(4),
}));
vi.mock('../../utils/parentStore.js', () => ({
  writeParent: (c: unknown, s: unknown, p: ParentDoc) => writeParent(c, s, p),
}));
vi.mock('./parlamentClient.js', () => ({
  PARLAMENT_BASE_URL: 'https://www.parlament.gv.at',
  ParlamentClient: class {
    listGegenstaende = client.listGegenstaende;
    getGegenstand = client.getGegenstand;
    getSitzung = client.getSitzung;
    getHtml = client.getHtml;
    getBytes = client.getBytes;
    getPersonKlub = client.getPersonKlub;
  },
}));

const { ParlamentAtScraper } = await import('./ParlamentAtScraper.js');

const ROW: ListRow = {
  gp: 'XXVIII',
  ityp: 'J',
  inr: '4483',
  hisUrl: '/gegenstand/XXVIII/J/4483',
  title: 'Reisekosten',
  zitation: '4483/J',
  doktypLang: 'Schriftliche Anfrage',
  datum: '2026-01-12',
  datumSort: '20260112',
  status: '5',
  phasenBis: '05',
  fraktionen: ['FPÖ'],
  themen: [],
};
const ROW_HASH = generateContentHash(`${ROW.datumSort}|${ROW.status}|${ROW.phasenBis}`);

const ANFRAGE: Gegenstand = {
  title: 'Reisekosten',
  documents: [
    {
      title: 'Anfrage (gescanntes Original)',
      documents: [{ link: '/dokument/J/scan.pdf', type: 'PDF' }],
    },
    {
      title: 'Anfrage (elektr. übermittelte Version)',
      documents: [{ link: '/dokument/J/fnameorig_1.html', type: 'HTML' }],
    },
  ],
  names: [
    { funktext: 'Eingebracht von', name: 'Michael Schnedlitz', frak_code: 'F' },
    {
      funktext: 'Eingebracht an',
      name: 'Dr. Markus Marterbauer',
      frak_code: 'S',
      ltext: 'Bundesministerium für Finanzen',
    },
  ],
  raw: '{"text":"Schriftliche Beantwortung (<a href=\\"/gegenstand/XXVIII/AB/3998\\">3998/AB</a>)"}',
};
const BEANTWORTUNG: Gegenstand = {
  title: 'Reisekosten',
  zitation: '3998/AB',
  einlangen: '2026-03-12T00:00:00',
  documents: [
    {
      title: 'Anfragebeantwortung',
      documents: [{ link: '/dokument/AB/imfname_2.pdf', type: 'PDF' }],
    },
  ],
  names: [
    {
      funktext: 'Beantwortet durch',
      name: 'Dr. Markus Marterbauer',
      frak_code: 'S',
      ltext: 'Bundesministerium für Finanzen',
    },
  ],
  raw: '{}',
};
const ANFRAGE_HTML =
  '<html><body><p>Wie hoch waren die Reisekosten Ihres Ressorts im vierten Quartal 2025?</p></body></html>';

function stored(points: Array<Record<string, unknown>>) {
  scroll.mockResolvedValue({
    points: points.map((payload) => ({ payload })),
    next_page_offset: null,
  });
}

describe('ParlamentAtScraper', () => {
  let scraper: InstanceType<typeof ParlamentAtScraper>;

  beforeEach(async () => {
    vi.clearAllMocks();
    stored([]);
    client.listGegenstaende.mockResolvedValue([ROW]);
    client.getGegenstand.mockImplementation(async (url: string) =>
      url.includes('/AB/') ? BEANTWORTUNG : ANFRAGE
    );
    client.getHtml.mockResolvedValue(ANFRAGE_HTML);
    client.getBytes.mockResolvedValue(new Uint8Array([1]));
    scraper = new ParlamentAtScraper();
    await scraper.init();
  });

  it('lädt eine Anfrage samt Beantwortung und nimmt das HTML statt des Scans', async () => {
    const summary = await scraper.scrapeAllSources({ kinds: ['anfrage'] });
    expect(summary).toMatchObject({ stored: 1, units: 2 });
    const parent = writeParent.mock.calls[0][2];
    expect(parent.units.map((u) => [u.payload.content_type, u.payload.party, u.sourceUrl])).toEqual(
      [
        ['anfrage', ['FPÖ'], 'https://www.parlament.gv.at/dokument/J/fnameorig_1.html'],
        ['anfragebeantwortung', ['SPÖ'], 'https://www.parlament.gv.at/dokument/AB/imfname_2.pdf'],
      ]
    );
    expect(parent.units[0].payload.ministerium).toBe('Bundesministerium für Finanzen');
  });

  it('ruft bei unverändertem Listen-Fingerprint keine Geschichtsseite ab', async () => {
    stored([{ parent_id: 'gegenstand:XXVIII:J:4483', row_hash: ROW_HASH, content_hash: 'x' }]);
    const summary = await scraper.scrapeAllSources({ kinds: ['anfrage'] });
    expect(summary).toMatchObject({ skipped: 1, stored: 0, updated: 0 });
    expect(client.getGegenstand).not.toHaveBeenCalled();
  });

  it('zieht bei gleichem Volltext nur den Fingerprint nach', async () => {
    await scraper.scrapeAllSources({ kinds: ['anfrage'] });
    const contentHash = writeParent.mock.calls[0][2].units[0].payload.content_hash;

    vi.clearAllMocks();
    stored([{ parent_id: 'gegenstand:XXVIII:J:4483', row_hash: 'alt', content_hash: contentHash }]);
    const summary = await scraper.scrapeAllSources({ kinds: ['anfrage'] });
    expect(summary).toMatchObject({ skipped: 1, updated: 0 });
    expect(writeParent).not.toHaveBeenCalled();
    expect(setPayload).toHaveBeenCalledWith(
      'parlament_at_documents',
      expect.objectContaining({
        payload: { row_hash: ROW_HASH },
      })
    );
  });

  it('schreibt im Probelauf nichts', async () => {
    const summary = await scraper.scrapeAllSources({ kinds: ['anfrage'], dryRun: true });
    expect(summary).toMatchObject({ stored: 1 });
    expect(writeParent).not.toHaveBeenCalled();
    expect(setPayload).not.toHaveBeenCalled();
  });

  it('lässt sich von einer kaputten Sitzung nicht die folgenden nehmen', async () => {
    client.getSitzung.mockImplementation(async (_gp: string, n: number) =>
      n <= 2
        ? {
            title: `${n}. Sitzung`,
            stdocuments: [
              {
                title: 'Stenographisches Protokoll',
                documents: [{ link: `/p${n}.html`, type: 'HTML' }],
              },
            ],
          }
        : null
    );
    client.getHtml.mockImplementation(async (path: string) => {
      if (path === '/p1.html') throw new Error('Parlament 403');
      return '<root><p class="randnummer" id="9" title="Herbert Kickl (FPÖ)">RN/9</p><p>Abgeordneter Herbert Kickl (FPÖ): Herr Präsident! Hohes Haus! Meine sehr geehrten Damen und Herren!</p></root>';
    });
    const summary = await scraper.scrapeAllSources({ kinds: ['rede'] });
    expect(summary).toMatchObject({ fetchErrors: 1, stored: 1 });
    expect(writeParent.mock.calls[0][2].parentId).toBe('nrsitz:XXVIII:2');
  });

  it('endet bei der ersten fehlenden Sitzung und lädt ein bekanntes Protokoll nicht neu', async () => {
    const path = '/dokument/XXVIII/NRSITZ/1/fnameorig_1.html';
    stored([{ parent_id: 'nrsitz:XXVIII:1', row_hash: path, content_hash: 'x' }]);
    client.getSitzung.mockImplementation(async (_gp: string, n: number) =>
      n === 1
        ? {
            title: '1. Sitzung',
            stdocuments: [
              { title: 'Stenographisches Protokoll', documents: [{ link: path, type: 'HTML' }] },
            ],
          }
        : null
    );
    const summary = await scraper.scrapeAllSources({ kinds: ['rede'] });
    expect(summary).toMatchObject({ skipped: 1, stored: 0 });
    expect(client.getSitzung).toHaveBeenCalledTimes(2);
    expect(client.getHtml).not.toHaveBeenCalled();
  });
});
