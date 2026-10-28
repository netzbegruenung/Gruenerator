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
