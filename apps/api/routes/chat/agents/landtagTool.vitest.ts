import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Deadline } from '../../../utils/deadline.js';
import { TOOL_TIMEOUT_OVERRIDES_MS } from '../services/agenticLoop/types.js';
import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  describeLandtagFilter,
  makeLandtagTool,
  makeNationalratTool,
  landtagDeadlineMs,
  NOTEBOOK_GRACE_MS,
} from './landtagTool.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const findLandtag = vi.fn<(p: string, q: string, f: unknown, d?: unknown) => Promise<unknown>>();
// Eine werfende `vi.fn` lässt Vitest den Test selbst rot färben; der Ausfall kommt darum aus dieser Weiche.
let ausfall = false;
vi.mock('../../../services/landtag/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findLandtag: (p: string, q: string, f: unknown, d?: unknown): Promise<unknown> => {
    if (ausfall) throw new Error('PARDOK 503');
    return findLandtag(p, q, f, d);
  },
}));

type Passage = { source: string; url?: string; excerpt: string };
const directSearch =
  vi.fn<
    (p: {
      query: string;
      collection?: string;
      limit?: number;
      searchMode?: string;
    }) => Promise<unknown>
  >();
vi.mock('./directSearchExecutors.js', () => ({
  executeDirectSearch: (p: { query: string; collection?: string; limit?: number }) =>
    directSearch(p),
}));
const notebook = (results: Passage[]) => ({
  collection: 'landtag_berlin_documents',
  query: '',
  searchMode: 'hybrid',
  resultsCount: results.length,
  results,
});

const state = (locale: string, text = ''): ChatGraphState =>
  ({
    intent: 'search',
    userLocale: locale,
    lastUserTextNoMentions: text,
  }) as unknown as ChatGraphState;

function exec(tool: unknown, input: unknown) {
  return (tool as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }).execute(
    input,
    { toolCallId: 'c1' }
  );
}

const candidate = {
  ref: 'BE 19/2601',
  dipId: 'D-436059',
  kind: 'drucksache',
  dokumentnummer: '19/2601',
  drucksachetyp: 'Antrag',
  titel: 'Kiezblocks retten',
  datum: '2025-07-08',
  urheber: ['Grüne'],
  pdfUrl: 'https://pardok.parlament-berlin.de/starweb/adis/citat/VT/19/DruckSachen/d19-2601.pdf',
  vorgangId: null,
  vorgangTitel: null,
  abstract: 'Verkehrssicherheit',
  aktualisiert: null,
  beratung: null,
};

describe('makeLandtagTool', () => {
  beforeEach(() => {
    findLandtag.mockReset();
    directSearch.mockReset();
    directSearch.mockResolvedValue(notebook([]));
    ausfall = false;
  });
  const make = (locale = 'de-DE', text = '') =>
    makeLandtagTool({ state: state(locale, text), sourceRegistry: createSourceRegistry() });

  it('nennt genau die Parlamente des Enums und grenzt andere Landtage zu web_search ab (#5567)', () => {
    const t = make() as unknown as {
      description: string;
      inputSchema: { jsonSchema?: { properties?: { parlament?: { enum?: string[] } } } };
    };
    const ids = (t.inputSchema as unknown as { shape: { parlament: { options: string[] } } }).shape
      .parlament.options as string[];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(t.description).toContain(`'${id}'`);
    expect(t.description).toMatch(/Nur diese Parlamente/);
    expect(t.description).toMatch(/andere Landtage[^.]*web_search/);
  });

  it('nimmt für ein Jahr den Zeitraum statt der Wahlperiode, die das Modell setzt (Berlin WP 20 seit 11/2026, live 04.11.2026)', async () => {
    findLandtag.mockResolvedValue({ candidates: [], gesamt: 0, notes: [] });
    await exec(make('de-DE', 'Wie viele Anträge haben die Grünen in Berlin 2026 gestellt?'), {
      parlament: 'berlin',
      wahlperiode: 19,
      typ: ['Antrag'],
    });
    const filters = findLandtag.mock.calls[0]![2] as Record<string, unknown>;
    expect(filters).toMatchObject({ datumVon: '2026-01-01', typ: ['Antrag'] });
    expect(filters).not.toHaveProperty('wahlperiode');

    await exec(make('de-DE', 'Anträge der Grünen 2026 in der 19. Wahlperiode'), {
      parlament: 'berlin',
      wahlperiode: 19,
    });
    expect(findLandtag.mock.calls[1]![2]).toMatchObject({ wahlperiode: 19 });
  });

  it('sagt Österreich ab, ohne zu suchen', async () => {
    const out = (await exec(make('de-AT'), { parlament: 'berlin', query: 'Verkehr' })) as {
      error: string;
    };
    expect(out.error).not.toBe('');
    expect(findLandtag).not.toHaveBeenCalled();
  });

  it('liefert Plenarprotokolle als Textstellen aus dem Notebook, mit der ganzen Frage (NRW, live 04.11.2026)', async () => {
    directSearch.mockResolvedValue({
      collection: 'landtag-nrw',
      results: [
        {
          source: 'Haushaltsgesetz 2027, 1. Lesung',
          url: 'https://www.landtag.nrw.de/Dokument?Id=MMP18%2F129|1|20',
          excerpt: 'Minister Optendrenk: …',
        },
      ],
    });
    const frage = 'Was wurde in der ersten Lesung des Haushalts 2027 gesagt?';
    const out = (await exec(make('de-DE', frage), {
      parlament: 'nrw',
      typ: ['Plenarprotokoll'],
    })) as { resultCount: number; sources: string; hinweis: string };
    expect(directSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: frage,
        collection: 'landtag-nrw',
        searchMode: 'vector',
        filters: { content_type: ['plenarprotokoll'] },
      })
    );
    expect(findLandtag).not.toHaveBeenCalled();
    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('NRW · Plenarprotokoll · Haushaltsgesetz 2027');
    expect(out.hinweis).toMatch(/direkt zitierbar/);
  });

  it('NRW: das Notebook ist die Quelle und behält die ganze Restzeit', async () => {
    vi.useFakeTimers();
    try {
      directSearch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  collection: 'landtag-nrw',
                  results: [{ source: 'Haushalt, 1. Lesung', url: null, excerpt: 'Text' }],
                }),
              30_000
            )
          )
      );
      const pending = exec(make('de-DE', 'Was wurde zum Haushalt gesagt?'), {
        parlament: 'nrw',
        typ: ['Plenarprotokoll'],
      });
      await vi.advanceTimersByTimeAsync(30_001);
      const out = (await pending) as { resultCount: number };
      expect(out.resultCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fragt bei gemischter Art die Liste ohne Protokolle und sagt es', async () => {
    findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
    const out = (await exec(make(), {
      parlament: 'berlin',
      typ: ['Antrag', 'Plenarprotokoll'],
    })) as { hinweise?: string[] };
    expect(findLandtag).toHaveBeenCalledWith(
      'berlin',
      '',
      expect.objectContaining({ typ: ['Antrag'] }),
      expect.any(Deadline)
    );
    expect(directSearch).not.toHaveBeenCalled();
    expect(out.hinweise).toEqual([expect.stringMatching(/typ Plenarprotokoll allein/)]);
  });

  it('sagt bei Antworten, dass die Titel nur die Fragen sind (Planer und Schreiber)', async () => {
    findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
    const out = (await exec(make(), { parlament: 'nrw', typ: ['Antwort'] })) as {
      hinweis: string;
      fuerSchreiber?: string;
    };
    expect(out.hinweis).toMatch(/^Die Titel sind die Fragen/);
    expect(out.fuerSchreiber).toMatch(/nur in Texten, die parlament_lesen geliefert hat/);

    const antrag = (await exec(make(), { parlament: 'nrw', typ: ['Antrag'] })) as {
      fuerSchreiber?: string;
    };
    expect(antrag.fuerSchreiber).toBeUndefined();
  });

  it('ohne Themenzähler (NRW mit Thema): keine gesamt, fuerSchreiber verbietet die Listenlänge als Zahl (#5577)', async () => {
    findLandtag.mockResolvedValue({
      candidates: [candidate],
      gesamt: null,
      notes: [
        'Sortiert nach inhaltlicher Nähe zu „Klimaschutz“; die Filter treffen etwa 8801 Drucksachen.',
      ],
    });
    const out = (await exec(make(), { parlament: 'nrw', query: 'Klimaschutz' })) as Record<
      string,
      any
    >;
    expect(out).not.toHaveProperty('gesamt');
    expect(out['uiCard']).not.toHaveProperty('gesamt');
    expect(out['fuerSchreiber']).toMatch(/nach Nähe gereihte Liste/);
    expect(out['fuerSchreiber']).toMatch(/keine Zahl/);
    expect(out['fuerSchreiber']).not.toMatch(/nenne \d+ als Gesamtzahl/);
  });

  it('gibt dem Schreiber die Gesamtzahl, wenn die Liste gedeckelt ist (Zählfrage, live 04.11.2026)', async () => {
    findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 77, notes: [] });
    const out = (await exec(make(), { parlament: 'berlin', typ: ['Antrag'] })) as {
      fuerSchreiber?: string;
    };
    expect(out.fuerSchreiber).toMatch(
      /Gesamtzahl laut Abgeordnetenhaus von Berlin: 77 Dokumente \(Art: Antrag\)\. .*nur 1 davon.*nenne 77/
    );

    findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
    const voll = (await exec(make(), { parlament: 'berlin', typ: ['Antrag'] })) as {
      fuerSchreiber?: string;
    };
    expect(voll.fuerSchreiber).toBeUndefined();
  });

  it('übernimmt Fraktion, Art und Jahr aus dem Wortlaut; gesetzte Argumente gehen vor', async () => {
    findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
    await exec(make('de-DE', 'Welche Anträge haben die Grünen in Berlin 2026 gestellt?'), {
      parlament: 'berlin',
      query: 'Verkehrswende',
      fraktion: ['spd'],
    });
    expect(findLandtag).toHaveBeenCalledWith(
      'berlin',
      'Verkehrswende',
      {
        typ: ['Antrag'],
        fraktion: ['spd'],
        datumVon: '2026-01-01',
        datumBis: '2026-12-31',
      },
      expect.any(Deadline)
    );
  });

  it('liefert Refs, Gesamtzahl, Hinweise, Lizenz-Quelle und eine Karte', async () => {
    findLandtag.mockResolvedValue({
      candidates: [candidate],
      gesamt: 12,
      notes: ['Filter Schlagwort wird nicht angewendet.'],
    });
    const out = (await exec(make(), {
      parlament: 'berlin',
      query: 'Verkehrswende',
      typ: ['Antrag'],
      fraktion: ['gruene'],
    })) as Record<string, unknown> & { uiCard: Record<string, unknown> };
    expect(out).toMatchObject({
      resultCount: 1,
      gesamt: 12,
      hinweise: ['Filter Schlagwort wird nicht angewendet.'],
      quelle: 'Quelle: Abgeordnetenhaus Berlin, PARDOK, DL-DE BY 2.0',
    });
    expect(out.sources).toContain('Ref: BE 19/2601');
    expect(out.sources).toContain('BE-Drs. 19/2601 · Antrag · 08.07.2025 · Grüne');
    expect(out.hinweis).toContain("quelle 'berlin'");
    expect(out.uiCard).toMatchObject({
      parlament: 'Berlin',
      filter: ['Art: Antrag', 'Fraktion: Grüne'],
      gesamt: 12,
      dokumente: [{ ref: 'BE 19/2601', url: candidate.pdfUrl }],
    });
  });

  it('reicht eine begründete Absage an den Schreiber statt als Fehler, ohne Karte', async () => {
    findLandtag.mockResolvedValue({
      candidates: [],
      gesamt: 0,
      notes: [],
      ausgeschlossen:
        'Die genannten Fraktionen (BSW) sind im Abgeordnetenhaus von Berlin nicht vertreten.',
    });
    const out = (await exec(make(), { parlament: 'berlin', fraktion: ['bsw'] })) as Record<
      string,
      unknown
    >;
    expect(out.resultCount).toBe(0);
    expect(out.fuerSchreiber).toMatch(/BSW/);
    expect(out).not.toHaveProperty('error');
    expect(out).not.toHaveProperty('uiCard');
  });

  describe('Textstellen aus dem Notebook (Berlin)', () => {
    const frage = 'Was hat der Senat zu Kiezblocks geantwortet?';

    it('sucht mit der ganzen Frage und legt die Textstelle zum selben PDF als Auszug an den Eintrag', async () => {
      findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
      directSearch.mockResolvedValue(
        notebook([
          { source: 'Kiezblocks retten', url: candidate.pdfUrl, excerpt: 'Der Senat prüft …' },
          {
            source: 'Ausschuss für Mobilität, 70. Sitzung',
            url: 'https://pardok.parlament-berlin.de/x/mv19-070-wp.pdf',
            excerpt: 'Kiezblocks im Ausschuss',
          },
        ])
      );
      const out = (await exec(make('de-DE', frage), {
        parlament: 'berlin',
        query: 'Kiezblock',
      })) as { resultCount: number; sources: string; hinweis: string };
      // „geantwortet" setzt die Art Antwort; das Notebook führt sie als `drucksache`.
      expect(directSearch).toHaveBeenCalledWith({
        query: frage,
        collection: 'landtag-berlin',
        limit: 4,
        searchMode: 'vector',
        filters: { content_type: ['drucksache'] },
      });
      // Ein Eintrag mit Auszug plus eine eigene Textstelle — kein zweiter Eintrag fürs selbe PDF.
      expect(out.resultCount).toBe(2);
      expect(out.sources).toContain('Auszug: Der Senat prüft');
      expect(out.sources).toContain('Kiezblocks im Ausschuss');
      expect(out.hinweis).toMatch(/Auszug/);
    });

    it('lässt ein hängendes Notebook die fertige Live-Liste nur kurz aufhalten (#5559)', async () => {
      vi.useFakeTimers();
      try {
        // Die Liste liegt nach 1 s vor, das Notebook hängt.
        findLandtag.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ candidates: [candidate], gesamt: 1, notes: [] }), 1_000)
            )
        );
        directSearch.mockReturnValue(new Promise(() => {}));
        let fertig = false;
        const pending = exec(make('de-DE', frage), { parlament: 'berlin', query: 'Kiezblock' });
        void pending.then(() => (fertig = true));
        await vi.advanceTimersByTimeAsync(1_000 + NOTEBOOK_GRACE_MS - 1);
        expect(fertig).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        const out = (await pending) as { resultCount: number; error?: string };
        expect(out.error).toBeUndefined();
        expect(out.resultCount).toBe(1);
        expect(1_000 + NOTEBOOK_GRACE_MS).toBeLessThan(landtagDeadlineMs('landtag'));
      } finally {
        vi.useRealTimers();
      }
    });

    it('wartet auf das Notebook die Restzeit ab, wenn die Live-Seite ausfällt', async () => {
      vi.useFakeTimers();
      try {
        ausfall = true;
        directSearch.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve(
                    notebook([
                      { source: 'Kiezblocks retten', url: candidate.pdfUrl, excerpt: 'Text' },
                    ])
                  ),
                20_000
              )
            )
        );
        const pending = exec(make('de-DE', frage), { parlament: 'berlin' });
        await vi.advanceTimersByTimeAsync(20_001);
        const out = (await pending) as { resultCount: number; error?: string };
        expect(out.error).toBeUndefined();
        expect(out.resultCount).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('liefert die Textstellen, wenn die Live-Abfrage ausfällt, und sagt es', async () => {
      ausfall = true;
      directSearch.mockResolvedValue(
        notebook([{ source: 'Kiezblocks retten', url: candidate.pdfUrl, excerpt: 'Text' }])
      );
      const out = (await exec(make('de-DE', frage), { parlament: 'berlin' })) as {
        resultCount: number;
        hinweise: string[];
        error?: string;
      };
      expect(out.error).toBeUndefined();
      expect(out.resultCount).toBe(1);
      expect(out.hinweise[0]).toMatch(/Live-Abfrage .* nicht erreichbar/);
    });

    it('lässt das Notebook weg, sobald ein Filter gilt, den es nicht einhalten kann', async () => {
      findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
      for (const text of ['Anfragen der Grünen zu Kiezblocks', 'Anfragen zu Kiezblocks 2026']) {
        await exec(make('de-DE', text), { parlament: 'berlin', query: 'Kiezblock' });
      }
      // Anträge führt das Notebook gar nicht.
      await exec(make('de-DE', frage), {
        parlament: 'berlin',
        query: 'Kiezblock',
        typ: ['Antrag'],
      });
      expect(directSearch).not.toHaveBeenCalled();
    });

    it('kostet bei einem Ausfall des Notebooks nur die Textstellen', async () => {
      findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
      directSearch.mockRejectedValue(new Error('Qdrant 503'));
      const out = (await exec(make('de-DE', frage), {
        parlament: 'berlin',
        query: 'Kiezblock',
      })) as {
        resultCount: number;
        hinweis: string;
      };
      expect(out.resultCount).toBe(1);
      expect(out.hinweis).toMatch(/nur Metadaten/);
    });
  });

  it('meldet einen Ausfall der Quelle als Fehler statt zu werfen', async () => {
    ausfall = true;
    const out = (await exec(make(), { parlament: 'berlin', query: 'x' })) as { error: string };
    expect(out.error).toMatch(/nicht erreichbar/);
  });
});

describe('makeNationalratTool', () => {
  beforeEach(() => {
    findLandtag.mockReset();
    directSearch.mockReset();
    ausfall = false;
  });
  const make = (locale: string, text = '') =>
    makeNationalratTool({ state: state(locale, text), sourceRegistry: createSourceRegistry() });

  it('sucht nur für Österreich, und immer im Nationalrat', async () => {
    const de = (await exec(make('de-DE'), { query: 'Miete' })) as { error: string };
    expect(de.error).toMatch(/nur für Österreich/);
    expect(findLandtag).not.toHaveBeenCalled();

    findLandtag.mockResolvedValue({
      candidates: [
        {
          ...candidate,
          ref: 'NR 28/A647',
          dokumentnummer: '647/A(E)',
          drucksachetyp: 'Selbständiger Entschließungsantrag',
          urheber: ['GRÜNE'],
          pdfUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/A/647',
        },
      ],
      gesamt: 1,
      notes: [],
    });
    const at = (await exec(make('de-AT', 'Anträge der Grünen zu Mieten'), { query: 'Miete' })) as {
      sources: string;
      quelle: string;
      hinweis: string;
      uiCard: { parlament: string };
    };
    expect(findLandtag).toHaveBeenCalledWith(
      'nationalrat',
      'Miete',
      expect.objectContaining({ fraktion: ['gruene'], typ: ['Antrag'] }),
      expect.any(Deadline)
    );
    expect(at.sources).toContain('647/A(E) · Selbständiger Entschließungsantrag');
    expect(at.quelle).toMatch(/CC BY 4\.0/);
    expect(at.hinweis).toContain("quelle 'nationalrat'");
    expect(at.uiCard.parlament).toBe('Nationalrat');
    // Der Nationalrat hat kein Notebook.
    expect(directSearch).not.toHaveBeenCalled();
  });
});

describe('describeLandtagFilter', () => {
  it('zeigt Fraktionen mit Anzeigenamen und Zeiträume deutsch', () => {
    expect(
      describeLandtagFilter({
        fraktion: ['gruene', 'linke'],
        datumVon: '2026-01-01',
        wahlperiode: 19,
      })
    ).toEqual(['Wahlperiode: 19', 'Fraktion: Grüne, Linke', 'Zeitraum: ab 01.01.2026']);
  });
});
