import { describe, expect, it, vi } from 'vitest';

import {
  describeRedenFilter,
  phraseKeywords,
  REDE_TEXT_MAX,
  redeTextCap,
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

describe('phraseKeywords', () => {
  it('zerlegt eine Phrase in Wörter ab drei Zeichen, klein und ohne Anführungszeichen', () => {
    expect(phraseKeywords('„mit Leben füllt“')).toEqual(['mit', 'leben', 'füllt']);
    expect(phraseKeywords('im')).toEqual(['im']);
  });
});

describe('searchBundestagReden: wortlaut', () => {
  const rede = (excerpt: string) => ({
    speaker: 'A',
    party: 'GRÜNE',
    date: '2025-05-23',
    excerpt,
    protokollNummer: '21/8',
    wahlperiode: 21,
    herausgeber: 'BT',
    topTitle: null,
    score: 0.5,
  });

  it('fordert die Phrase hart an, holt 50 Kandidaten und prüft den Redetext nach', async () => {
    const searchSpeechesFull = vi.fn(async (_opts: Record<string, unknown>) => ({
      items: [
        rede('Das ist eine „Zeitenwende“ in der Politik.'),
        rede('Wende und Zeit sind getrennte Wörter.'),
        rede('Nach der ZEITENWENDE kam die Haushaltsdebatte.'),
      ],
      wpFallback: false,
    }));
    const client = { searchSpeechesFull } as unknown as RedenClient;
    const r = await searchBundestagReden(
      { thema: 'Zeitenwende', wortlaut: true, limit: 5 },
      client
    );
    expect(searchSpeechesFull).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Zeitenwende',
        requiredKeywords: ['zeitenwende'],
        limit: 50,
      })
    );
    expect(r.speeches).toHaveLength(2);
  });

  it('kürzt auf limit und läuft ohne wortlaut wie bisher', async () => {
    const searchSpeechesFull = vi.fn(async (_opts: Record<string, unknown>) => ({
      items: [rede('Zeitenwende eins'), rede('Zeitenwende zwei')],
      wpFallback: false,
    }));
    const client = { searchSpeechesFull } as unknown as RedenClient;
    const r = await searchBundestagReden(
      { thema: 'Zeitenwende', wortlaut: true, limit: 1 },
      client
    );
    expect(r.speeches).toHaveLength(1);
    await searchBundestagReden({ thema: 'Zeitenwende' }, client);
    const plain = searchSpeechesFull.mock.calls[1]![0];
    expect(plain).not.toHaveProperty('requiredKeywords');
    expect(plain['limit']).toBe(5);
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
      maxChars: 4000,
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

describe('Redetext-Budget', () => {
  it('gibt einer einzelnen Rede bis 20.000 Zeichen, mehreren je ihren Anteil, nie unter 4.000', () => {
    expect(redeTextCap(1)).toBe(REDE_TEXT_MAX);
    expect(redeTextCap(5)).toBe(4800);
    expect(redeTextCap(10)).toBe(4000);
  });

  it('fragt den MCP mit der Kappe zur Trefferzahl', async () => {
    const { client, searchSpeechesFull } = stub();
    await searchBundestagReden({ thema: 'Wärme', limit: 1 }, client);
    expect(searchSpeechesFull).toHaveBeenCalledWith(
      expect.objectContaining({ maxChars: REDE_TEXT_MAX })
    );
  });

  it('findet eine Phrase auch hinter Zeichen 4.000 und kappt erst danach', async () => {
    // Bis 10/2026 prüfte die Wortlautsuche auf dem bei 4.000 gekappten Text:
    // eine Fundstelle weiter hinten fiel still durch.
    const lang = `${'Lorem ipsum dolor sit amet. '.repeat(200)}Hier fällt die Zeitenwende.`;
    const searchSpeechesFull = vi.fn(async (_opts: Record<string, unknown>) => ({
      items: [{ ...rede, excerpt: lang }],
      wpFallback: false,
    }));
    const client = { searchSpeechesFull } as unknown as RedenClient;
    const r = await searchBundestagReden(
      { thema: 'Zeitenwende', wortlaut: true, limit: 5 },
      client
    );
    expect(searchSpeechesFull).toHaveBeenCalledWith(
      expect.objectContaining({ maxChars: REDE_TEXT_MAX })
    );
    expect(r.speeches).toHaveLength(1);
    expect(r.speeches[0]!.excerpt).toContain('Zeitenwende');
  });
});
