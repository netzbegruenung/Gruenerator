import { describe, expect, it, vi } from 'vitest';

import {
  describeRedenFilter,
  redeTitle,
  redeUrl,
  redenFilterFromWording,
  redenPartei,
  searchBundestagReden,
  type RedenClient,
} from './reden.js';

const rede = {
  speaker: 'Katrin Uhlig',
  party: 'GRÜNE',
  date: '2025-05-23',
  excerpt: 'Sehr geehrte Frau Präsidentin!',
  protokollNummer: '21/8',
  wahlperiode: 21,
  herausgeber: 'BT',
  topTitle: null,
  score: 0.75,
};

function stub() {
  const searchSpeechesFull = vi.fn(async () => ({ items: [rede], wpFallback: false }));
  return { client: { searchSpeechesFull } as unknown as RedenClient, searchSpeechesFull };
}

describe('redenPartei', () => {
  it.each([
    ['Fraktion BÜNDNIS 90/DIE GRÜNEN', 'GRÜNE'],
    ['Grüne', 'GRÜNE'],
    ['Fraktion der CDU/CSU', 'CDU/CSU'],
    ['Union', 'CDU/CSU'],
    ['Linke', 'DIE LINKE'],
    ['SPD', 'SPD'],
    ['BSW', 'BSW'],
  ] as const)('%s → %s', (lang, kurz) => {
    expect(redenPartei(lang)).toBe(kurz);
  });
});

describe('searchBundestagReden', () => {
  it('reicht Kurzname, Zeitraum, Sortierung und volle Rede an den MCP', async () => {
    const { client, searchSpeechesFull } = stub();
    const r = await searchBundestagReden(
      {
        thema: 'Wärmeplanung',
        redner: 'Katrin Uhlig',
        fraktion: 'Fraktion BÜNDNIS 90/DIE GRÜNEN',
        datumVon: '2025-01-01',
        sortierung: 'neueste',
        limit: 50,
      },
      client
    );
    expect(searchSpeechesFull).toHaveBeenCalledWith({
      query: 'Wärmeplanung',
      speaker: 'Katrin Uhlig',
      speakerParty: 'GRÜNE',
      dateFrom: '2025-01-01',
      limit: 10,
      sort: 'newest',
    });
    expect(r.speeches).toHaveLength(1);
  });

  it('lässt einen MCP-Ausfall durch', async () => {
    const client = {
      searchSpeechesFull: vi.fn(async () => {
        throw new Error('down');
      }),
    } as unknown as RedenClient;
    await expect(searchBundestagReden({ thema: 'x' }, client)).rejects.toThrow('down');
  });
});

describe('redenFilterFromWording', () => {
  it('liest Zeitraum, „zuletzt" und eine Fraktion ohne Redner', () => {
    expect(
      redenFilterFromWording(
        'Was haben die Grünen zuletzt seit 2025 zur Wärmeplanung gesagt?',
        false
      )
    ).toEqual({
      datumVon: '2025-01-01',
      sortierung: 'neueste',
      fraktion: 'Fraktion BÜNDNIS 90/DIE GRÜNEN',
    });
  });

  it('nimmt mit Redner keine Fraktion aus dem Wortlaut', () => {
    expect(redenFilterFromWording('Was hat Katrin Uhlig der Union erwidert?', true)).toEqual({});
  });

  it('nimmt bei zwei Fraktionen keine', () => {
    expect(redenFilterFromWording('Streit zwischen SPD und Union', false)).toEqual({});
  });
});

describe('Ausgabe', () => {
  it('Titel und Protokoll-PDF', () => {
    expect(redeTitle(rede)).toBe('Rede Katrin Uhlig (GRÜNE) · Plenarprotokoll 21/8 · 23.05.2025');
    expect(redeUrl(rede)).toBe('https://dserver.bundestag.de/btp/21/21008.pdf');
    expect(redeUrl({ ...rede, herausgeber: 'BR' })).toBeNull();
  });

  it('Filter in Worten', () => {
    expect(
      describeRedenFilter({ redner: 'Katrin Uhlig', fraktion: 'Grüne', sortierung: 'neueste' })
    ).toEqual(['Redner*in: Katrin Uhlig', 'Fraktion: GRÜNE', 'Sortierung: neueste zuerst']);
  });
});
