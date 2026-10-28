import { readFileSync } from 'node:fs';

import { type BundestagCandidate } from '@gruenerator/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extractPdfText = vi.fn();
vi.mock('../../pdf/pdfText.js', () => ({
  extractPdfText: (...a: unknown[]) => extractPdfText(...a),
}));
// DNS-Prüfung ersetzt, die Host-/Protokollprüfung der Stufe bleibt echt.
const validateUrlForFetch = vi.fn(async (u: string) => ({ isValid: true, url: new URL(u) }));
vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: (u: string) => validateUrlForFetch(u),
}));

import { fetchTexts, parseDebate, resolveRefs } from './fetchTexts.js';

const FIXTURE = readFileSync(
  new URL('./__fixtures__/plpr-21-80-ausschnitt.xml', import.meta.url),
  'utf8'
);

function cand(over: Partial<BundestagCandidate>): BundestagCandidate {
  return {
    ref: '21/1',
    dipId: '1',
    kind: 'drucksache',
    dokumentnummer: '21/1',
    drucksachetyp: 'Antrag',
    titel: 't',
    datum: '2026-01-01',
    urheber: [],
    pdfUrl: null,
    vorgangId: null,
    vorgangTitel: null,
    abstract: null,
    aktualisiert: '2026-01-02',
    beratung: null,
    ...over,
  };
}

function redisMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, _o: { EX: number }) => {
      store.set(k, v);
      return 'OK';
    }),
  };
}

const page = (ids: string[], cursor: string | null, text = 'Volltext') => ({
  numFound: 12,
  cursor,
  documents: ids.map((id) => ({ id, dokumentnummer: `21/${id}`, text: `${text} ${id}` })),
});

beforeEach(() => {
  extractPdfText.mockReset();
  validateUrlForFetch.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('resolveRefs', () => {
  it('löst Drucksachen mit mehrfachem f.dokumentnummer auf und nimmt nur exakte Treffer', async () => {
    const dip = {
      list: vi.fn(async () => ({
        numFound: 2,
        cursor: null,
        documents: [
          {
            id: '281921',
            dokumentnummer: '21/1928',
            drucksachetyp: 'Antrag',
            titel: 'A',
            datum: '2026-02-01',
            aktualisiert: '2026-03-01T10:00:00+01:00',
            urheber: [{ titel: 'SPD' }],
            fundstelle: { pdf_url: 'https://dserver.bundestag.de/btd/21/019/2101928.pdf' },
            vorgangsbezug: [{ id: '77', titel: 'V' }],
          },
          { id: '9', dokumentnummer: '21/19280', titel: 'falsch' },
        ],
      })),
    };
    const r = await resolveRefs(['21/1928'], dip as never);
    expect(dip.list).toHaveBeenCalledWith('drucksache', {
      'f.dokumentnummer': ['21/1928'],
      'f.zuordnung': 'BT',
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      ref: '21/1928',
      dipId: '281921',
      kind: 'drucksache',
      urheber: ['SPD'],
      vorgangId: '77',
      pdfUrl: 'https://dserver.bundestag.de/btd/21/019/2101928.pdf',
      beratung: null,
    });
  });

  it('leitet für Debatten die XML-URL aus der Ref ab und fragt DIP nicht', async () => {
    const dip = { list: vi.fn() };
    const r = await resolveRefs(['PlPr 21/80 S. 9553-9572'], dip);
    expect(dip.list).not.toHaveBeenCalled();
    expect(r[0]).toMatchObject({
      kind: 'beratung',
      dokumentnummer: '21/80',
      drucksachetyp: 'Plenarprotokoll',
      beratung: {
        xmlUrl: 'https://dserver.bundestag.de/btp/21/21080.xml',
        anfangsseite: 9553,
        endseite: 9572,
      },
    });
  });

  it('ruft DIP nie mit leerer Liste auf', async () => {
    const dip = { list: vi.fn() };
    expect(await resolveRefs([], dip)).toEqual([]);
    expect(dip.list).not.toHaveBeenCalled();
  });
});

describe('fetchTexts: Drucksachen', () => {
  it('blättert mehrfaches f.id über zwei Seiten', async () => {
    const dip = {
      list: vi
        .fn()
        .mockResolvedValueOnce(page(['1', '2'], 'c1'))
        .mockResolvedValueOnce(page(['3'], 'c1')),
    };
    const redis = redisMock();
    const out = await fetchTexts(
      [cand({ dipId: '1' }), cand({ dipId: '2' }), cand({ dipId: '3' })],
      { dip, redis, signal: new AbortController().signal }
    );
    expect(dip.list).toHaveBeenCalledTimes(2);
    expect(dip.list.mock.calls[0]).toEqual(['drucksache-text', { 'f.id': ['1', '2', '3'] }]);
    expect(dip.list.mock.calls[1][1]).toMatchObject({ cursor: 'c1' });
    expect(out.map((d) => [d.text, d.textSource])).toEqual([
      ['Volltext 1', 'dip'],
      ['Volltext 2', 'dip'],
      ['Volltext 3', 'dip'],
    ]);
    expect(redis.set).toHaveBeenCalledWith('bt:qa:text:v1:1:2026-01-02', expect.any(String), {
      EX: 604_800,
    });
  });

  it('nimmt Treffer aus dem Cache und fragt DIP nur nach dem Rest', async () => {
    const redis = redisMock({
      'bt:qa:text:v1:1:2026-01-02': JSON.stringify({ text: 'aus Cache', textSource: 'dip' }),
    });
    const dip = { list: vi.fn().mockResolvedValue(page(['2'], null)) };
    const out = await fetchTexts([cand({ dipId: '1' }), cand({ dipId: '2' })], {
      dip,
      redis,
      signal: new AbortController().signal,
    });
    expect(dip.list.mock.calls[0][1]).toEqual({ 'f.id': ['2'] });
    expect(out[0].text).toBe('aus Cache');
  });

  it('ruft DIP gar nicht, wenn alles im Cache liegt', async () => {
    const redis = redisMock({
      'bt:qa:text:v1:1:2026-01-02': JSON.stringify({ text: 'x', textSource: 'dip' }),
    });
    const dip = { list: vi.fn() };
    await fetchTexts([cand({ dipId: '1' })], { dip, redis, signal: new AbortController().signal });
    expect(dip.list).not.toHaveBeenCalled();
  });

  it('fällt bei leerem Text auf das PDF zurück und cacht leere Texte nicht', async () => {
    const dip = { list: vi.fn().mockResolvedValue(page(['5'], null, '')) };
    dip.list.mockResolvedValue({
      numFound: 1,
      cursor: null,
      documents: [{ id: '5', dokumentnummer: '21/8812', text: '' }],
    });
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { headers: { 'content-length': '3' } }))
    );
    extractPdfText.mockResolvedValue('PDF-Inhalt');
    const redis = redisMock();
    const out = await fetchTexts(
      [cand({ dipId: '5', pdfUrl: 'https://dserver.bundestag.de/btd/21/088/2108812.pdf' })],
      { dip, redis, signal: new AbortController().signal }
    );
    expect(out[0]).toMatchObject({ text: 'PDF-Inhalt', textSource: 'pdf' });
    expect(validateUrlForFetch).toHaveBeenCalledWith(
      'https://dserver.bundestag.de/btd/21/088/2108812.pdf'
    );

    // Scheitert auch das PDF: missing, und es wird nichts gecacht.
    extractPdfText.mockRejectedValue(new Error('kaputt'));
    const redis2 = redisMock();
    const out2 = await fetchTexts(
      [cand({ dipId: '5', pdfUrl: 'https://dserver.bundestag.de/btd/21/088/2108812.pdf' })],
      { dip, redis: redis2, signal: new AbortController().signal }
    );
    expect(out2[0]).toMatchObject({ text: '', textSource: 'missing' });
    expect(redis2.set).not.toHaveBeenCalled();
  });

  it('lehnt einen fremden Host ab, ohne zu holen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const dip = {
      list: vi.fn().mockResolvedValue({
        numFound: 1,
        cursor: null,
        documents: [{ id: '5', dokumentnummer: '21/1', text: '' }],
      }),
    };
    for (const pdfUrl of ['https://evil.example/x.pdf', 'http://dserver.bundestag.de/x.pdf']) {
      const out = await fetchTexts([cand({ dipId: '5', pdfUrl })], {
        dip,
        redis: redisMock(),
        signal: new AbortController().signal,
      });
      expect(out[0].textSource).toBe('missing');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(validateUrlForFetch).not.toHaveBeenCalled();
  });

  it('bricht ab, wenn die Antwort PDF_MAX_BYTES übersteigt', async () => {
    const dip = {
      list: vi.fn().mockResolvedValue({
        numFound: 1,
        cursor: null,
        documents: [{ id: '5', dokumentnummer: '21/1', text: '' }],
      }),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { headers: { 'content-length': '99999999' } }))
    );
    const out = await fetchTexts(
      [cand({ dipId: '5', pdfUrl: 'https://dserver.bundestag.de/a.pdf' })],
      { dip, redis: redisMock(), signal: new AbortController().signal }
    );
    expect(out[0].textSource).toBe('missing');
    expect(extractPdfText).not.toHaveBeenCalled();
  });
});

describe('parseDebate', () => {
  it('schneidet nur Reden mit Startseite im Bereich, ohne Kommentare', () => {
    const text = parseDebate(FIXTURE, 9509, 9510);
    expect(text).toContain('### Jörn König (AfD)');
    expect(text).toContain('### Bettina Lugk (SPD)');
    expect(text).not.toContain('Schenderlein');
    expect(text).not.toContain('Winklmann');
    expect(text).not.toContain('Beifall');
    expect(text).not.toContain('Hat aber nicht gut geklappt');
    expect(text).toContain('Vielen Dank und Sport frei!');
    // Zwischenrufe der Präsidentin stehen in der Rede, gehören aber nicht dazu.
    expect(text).not.toContain('Unteroffizierschule');
  });

  it('nennt bei Regierungsmitgliedern die Rolle statt der Fraktion', () => {
    expect(parseDebate(FIXTURE, 9508, 9508)).toContain(
      '### Christiane Schenderlein (Staatsministerin beim Bundeskanzler)'
    );
  });

  it('liefert leer, wenn keine Rede im Bereich liegt', () => {
    expect(parseDebate(FIXTURE, 1, 2)).toBe('');
  });
});

describe('fetchTexts: Debatten', () => {
  const debate = cand({
    ref: 'PlPr 21/80 S. 9509-9510',
    dipId: 'plpr:21/80',
    kind: 'beratung',
    dokumentnummer: '21/80',
    drucksachetyp: 'Plenarprotokoll',
    beratung: {
      xmlUrl: 'https://dserver.bundestag.de/btp/21/21080.xml',
      anfangsseite: 9509,
      endseite: 9510,
    },
  });

  it('holt das XML, schneidet und cacht unter dem Debatten-Schlüssel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FIXTURE))
    );
    const redis = redisMock();
    const out = await fetchTexts([debate], {
      dip: { list: vi.fn() },
      redis,
      signal: new AbortController().signal,
    });
    expect(out[0].textSource).toBe('protokoll');
    expect(out[0].text).toContain('### Jörn König (AfD)');
    expect([...redis.store.keys()]).toEqual([
      'bt:qa:debatte:v1:https://dserver.bundestag.de/btp/21/21080.xml:9509-9510',
    ]);
  });

  it('lehnt ein XML von fremdem Host ab', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchTexts(
      [{ ...debate, beratung: { ...debate.beratung!, xmlUrl: 'https://evil.example/a.xml' } }],
      { dip: { list: vi.fn() }, redis: redisMock(), signal: new AbortController().signal }
    );
    expect(out[0].textSource).toBe('missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
