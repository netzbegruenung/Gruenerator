import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { describeLandtagFilter, makeLandtagTool } from './landtagTool.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const findLandtag = vi.fn<(p: string, q: string, f: unknown) => Promise<unknown>>();
// Eine werfende `vi.fn` lässt Vitest den Test selbst rot färben; der Ausfall kommt darum aus dieser Weiche.
let ausfall = false;
vi.mock('../../../services/landtag/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findLandtag: (p: string, q: string, f: unknown): Promise<unknown> => {
    if (ausfall) throw new Error('PARDOK 503');
    return findLandtag(p, q, f);
  },
}));

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
    ausfall = false;
  });
  const make = (locale = 'de-DE', text = '') =>
    makeLandtagTool({ state: state(locale, text), sourceRegistry: createSourceRegistry() });

  it('sagt Österreich ab, ohne zu suchen', async () => {
    const out = (await exec(make('de-AT'), { parlament: 'berlin', query: 'Verkehr' })) as {
      error: string;
    };
    expect(out.error).not.toBe('');
    expect(findLandtag).not.toHaveBeenCalled();
  });

  it('übernimmt Fraktion, Art und Jahr aus dem Wortlaut; gesetzte Argumente gehen vor', async () => {
    findLandtag.mockResolvedValue({ candidates: [candidate], gesamt: 1, notes: [] });
    await exec(make('de-DE', 'Welche Anträge haben die Grünen in Berlin 2026 gestellt?'), {
      parlament: 'berlin',
      query: 'Verkehrswende',
      fraktion: ['spd'],
    });
    expect(findLandtag).toHaveBeenCalledWith('berlin', 'Verkehrswende', {
      typ: ['Antrag'],
      fraktion: ['spd'],
      datumVon: '2026-01-01',
      datumBis: '2026-12-31',
    });
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

  it('gibt bei null Treffern den ersten Hinweis als Fehler zurück, ohne Karte', async () => {
    findLandtag.mockResolvedValue({
      candidates: [],
      gesamt: 0,
      notes: [
        'Die genannten Fraktionen (BSW) sind im Abgeordnetenhaus von Berlin nicht vertreten.',
      ],
    });
    const out = (await exec(make(), { parlament: 'berlin', fraktion: ['bsw'] })) as Record<
      string,
      unknown
    >;
    expect(out.resultCount).toBe(0);
    expect(out.error).toMatch(/BSW/);
    expect(out).not.toHaveProperty('uiCard');
  });

  it('meldet einen Ausfall der Quelle als Fehler statt zu werfen', async () => {
    ausfall = true;
    const out = (await exec(make(), { parlament: 'berlin', query: 'x' })) as { error: string };
    expect(out.error).toMatch(/nicht erreichbar/);
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
