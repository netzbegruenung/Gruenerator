import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.fn();
// Wirft über eine nackte Funktion statt über vi.fn: vitest meldet geworfene Mock-Fehler sonst als Testfehler.
let boom = false;
vi.mock('../../ai/generate.js', () => ({
  aiObject: (...a: unknown[]) => {
    if (boom) throw new Error('boom');
    return aiObject(...a);
  },
}));

import { keywordsFromQuestion, planFilters } from './plan.js';

function dipWith(counts: Record<string, number>) {
  return {
    list: vi.fn(async (_e: string, params: Record<string, unknown>) => ({
      numFound: counts[String(params['f.deskriptor'])] ?? 0,
      cursor: null,
      documents: [],
    })),
  };
}

const model = (data: Record<string, unknown>) => aiObject.mockResolvedValue({ ok: true, data });

beforeEach(() => {
  aiObject.mockReset();
  boom = false;
});

describe('planFilters', () => {
  it('erkennt Drucksachennummer und Wahlperiode deterministisch', async () => {
    model({ keywords: ['heizung', 'gesetz', 'förderung'] });
    const r = await planFilters({
      question: 'Was steht in Drucksache 20/6875, WP 20?',
      explicit: {},
      dip: dipWith({}),
    });
    expect(r.filters.dokumentnummer).toEqual(['20/6875']);
    expect(r.filters.wahlperiode).toEqual([20]);
    expect(r.assumedWahlperiode).toBe(false);
  });

  it('Wortlaut liefert Typ, Urheber und Datum auch bei dünner Modellantwort', async () => {
    model({ keywords: ['entschließungsanträge', 'grünen'], wahlperiode: [21] });
    const r = await planFilters({
      question: 'Welche Entschließungsanträge haben die Grünen seit Januar 2026 eingebracht?',
      explicit: {},
      dip: dipWith({}),
    });
    expect(r.filters.drucksachetyp).toEqual(['Entschließungsantrag']);
    expect(r.filters.urheber).toEqual(['Fraktion BÜNDNIS 90/DIE GRÜNEN']);
    expect(r.filters.datumVon).toBe('2026-01-01');
  });

  it('erkannt schlägt Modell, explicit schlägt erkannt', async () => {
    model({
      keywords: ['anträge', 'grünen'],
      drucksachetyp: ['Gesetzentwurf'],
      urheber: ['Fraktion der SPD'],
    });
    const r = await planFilters({
      question: 'Welche Anträge der Grünen?',
      explicit: { urheber: ['Fraktion der AfD'] },
      dip: dipWith({}),
    });
    expect(r.filters.drucksachetyp).toEqual(['Antrag']);
    expect(r.filters.urheber).toEqual(['Fraktion der AfD']);
  });

  it('explicit schlägt Erkanntes', async () => {
    model({ keywords: ['a1234', 'b1234', 'c1234'], wahlperiode: [19] });
    const r = await planFilters({
      question: 'Wahlperiode 20 Heizung',
      explicit: { wahlperiode: [19] },
      dip: dipWith({}),
    });
    expect(r.filters.wahlperiode).toEqual([19]);
  });

  it('verwirft Deskriptoren ohne Treffer mit Notiz', async () => {
    model({
      keywords: ['wärme', 'pumpe', 'förderung'],
      deskriptor: ['Wärmepumpe', 'Fantasiewort'],
    });
    const r = await planFilters({
      question: 'Wärmepumpe Förderung',
      explicit: {},
      dip: dipWith({ Wärmepumpe: 19 }),
    });
    expect(r.filters.deskriptor).toEqual(['Wärmepumpe']);
    expect(r.notes.some((n) => n.includes('Fantasiewort'))).toBe(true);
  });

  it('setzt ohne Wahlperiode [21] mit Notiz', async () => {
    model({ keywords: ['klima', 'schutz', 'gesetz'] });
    const r = await planFilters({ question: 'Klimaschutz', explicit: {}, dip: dipWith({}) });
    expect(r.filters.wahlperiode).toEqual([21]);
    expect(r.assumedWahlperiode).toBe(true);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('wirft nie: Modellfehler lässt deterministische Filter und Notiz', async () => {
    boom = true;
    const r = await planFilters({
      question: 'Siehe 21/123 Heizungsgesetz',
      explicit: {},
      dip: dipWith({}),
    });
    expect(r.filters.dokumentnummer).toEqual(['21/123']);
    expect(r.keywords).toContain('heizungsgesetz');
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('wirft nie: ok:false des Modells', async () => {
    aiObject.mockResolvedValue({ ok: false, error: 'x' });
    const r = await planFilters({ question: 'Heizungsgesetz', explicit: {}, dip: dipWith({}) });
    expect(r.filters.wahlperiode).toEqual([21]);
  });
});

describe('planFilters Randfälle', () => {
  it('verwirft ein krummes Datum mit Notiz, behält den Rest', async () => {
    model({
      keywords: ['klima', 'schutz', 'gesetz'],
      datumVon: '1.1.2024',
      datumBis: '2024-12-31',
    });
    const r = await planFilters({ question: 'Klimaschutz', explicit: {}, dip: dipWith({}) });
    expect(r.filters.datumVon).toBeUndefined();
    expect(r.filters.datumBis).toBe('2024-12-31');
    expect(r.notes.some((n) => n.includes('datumVon'))).toBe(true);
  });

  it('ignoriert Wahlperiode 99', async () => {
    model({ keywords: ['klima', 'schutz', 'gesetz'] });
    const r = await planFilters({
      question: 'Wahlperiode 99 Klima',
      explicit: {},
      dip: dipWith({}),
    });
    expect(r.filters.wahlperiode).toEqual([21]);
  });

  it('zählt Deskriptoren mit der vorbelegten Wahlperiode 21', async () => {
    model({ keywords: ['wärme', 'pumpe', 'förderung'], deskriptor: ['Wärmepumpe'] });
    const dip = dipWith({ Wärmepumpe: 3 });
    await planFilters({ question: 'Wärmepumpe', explicit: {}, dip });
    expect(dip.list).toHaveBeenCalledWith(
      'vorgang',
      expect.objectContaining({ 'f.wahlperiode': [21] })
    );
  });

  it('explicit mit undefined-Werten überschreibt Erkanntes nicht', async () => {
    model({ keywords: ['klima', 'schutz', 'gesetz'] });
    const r = await planFilters({
      question: 'WP 20 Klima',
      explicit: { wahlperiode: undefined },
      dip: dipWith({}),
    });
    expect(r.filters.wahlperiode).toEqual([20]);
  });
});

describe('planFilters Runde 2', () => {
  it('erkennt „diese Wahlperiode" als 21 (erkannt, nicht angenommen)', async () => {
    model({
      keywords: ['wärmepumpe', 'förderung', 'antrag'],
      wahlperiode: [20],
      deskriptor: ['Wärmepumpe'],
    });
    const r = await planFilters({
      question: 'Was wurde in dieser Wahlperiode zur Wärmepumpe beantragt?',
      explicit: {},
      dip: dipWith({ Wärmepumpe: 19 }),
    });
    expect(r.filters.wahlperiode).toEqual([21]);
    expect(r.assumedWahlperiode).toBe(false);
  });

  it('nennt die 21. Wahlperiode im Prompt', async () => {
    model({ keywords: ['klima', 'schutz', 'gesetz'] });
    await planFilters({ question: 'Klima', explicit: {}, dip: dipWith({}) });
    expect(aiObject.mock.calls[0][0].system).toContain('21. (seit 2025)');
  });

  it('ohne json-Modus: Mistral lehnt json_object neben erzwungenem Tool ab', async () => {
    model({ keywords: ['klima', 'schutz', 'gesetz'] });
    await planFilters({ question: 'Klima', explicit: {}, dip: dipWith({}) });
    expect(aiObject.mock.calls[0][0]).not.toHaveProperty('json');
  });

  it('leitet ohne Deskriptor einen aus den Suchwörtern ab (Singularform)', async () => {
    model({ keywords: ['Anträge', 'grüne Bundestagsfraktion', 'Wärmepumpen'] });
    const dip = dipWith({ Wärmepumpe: 19 });
    const r = await planFilters({ question: 'Anträge zu Wärmepumpen', explicit: {}, dip });
    expect(r.filters.deskriptor).toEqual(['Wärmepumpe']);
    const counted = dip.list.mock.calls.map((c) => c[1]['f.deskriptor']);
    expect(counted).not.toContain('Anträge');
    expect(counted).not.toContain('Bundestagsfraktion');
    expect(counted.length).toBeLessThanOrEqual(6);
  });

  it('fällt ohne Deskriptor-Treffer auf den längsten Themenbegriff als Titel zurück', async () => {
    model({ keywords: ['Bundesregierung', 'Wärmepumpenförderung', 'Antwort'] });
    const r = await planFilters({ question: 'x', explicit: {}, dip: dipWith({}) });
    expect(r.filters.deskriptor).toBeUndefined();
    expect(r.filters.titel).toBe('Wärmepumpenförderung');
    expect(r.notes.some((n) => n.includes('Titel'))).toBe(true);
  });

  it('lässt bei Dokumentnummer die Ableitung aus', async () => {
    model({ keywords: ['Wärmepumpen', 'förderung', 'gesetz'] });
    const dip = dipWith({});
    await planFilters({ question: 'Drucksache 21/123', explicit: {}, dip });
    expect(dip.list).not.toHaveBeenCalled();
  });
});

describe('keywordsFromQuestion', () => {
  it('nimmt Wörter ab 5 Zeichen, klein, ohne Dubletten und Stoppwörter, max 8', () => {
    const k = keywordsFromQuestion(
      'Welche Heizung Heizung wurde beschlossen? Wärmepumpe, Klimaschutz, Förderung, Gebäude, Energie, Wasserstoff, Netzausbau, Speicher'
    );
    expect(k[0]).toBe('heizung');
    expect(k).not.toContain('welche');
    expect(k.filter((w) => w === 'heizung')).toHaveLength(1);
    expect(k).toHaveLength(8);
    expect(k.every((w) => w === w.toLowerCase() && w.length >= 5)).toBe(true);
  });
});
