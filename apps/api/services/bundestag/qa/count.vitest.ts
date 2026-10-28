import { describe, expect, it, vi } from 'vitest';

import { countBundestag, formatCount } from './count.js';

/** DIP-Attrappe: numFound aus einer Funktion der Parameter. */
function dipWith(numFound: (endpoint: string, p: Record<string, unknown>) => number) {
  const list = vi.fn(async (endpoint: string, p: Record<string, unknown>) => ({
    numFound: numFound(endpoint, p),
    cursor: null,
    documents: [],
  }));
  return { dip: { list } as never, list };
}

describe('countBundestag', () => {
  it('zählt Drucksachen mit Typ und Wahlperiode, ohne Gruppierung ein Aufruf', async () => {
    const { dip, list } = dipWith(() => 2903);
    const r = await countBundestag({
      filters: { drucksachetyp: ['Kleine Anfrage'], wahlperiode: [21] },
      dip,
    });
    expect(r).toMatchObject({ einheit: 'Drucksachen', gesamt: 2903, gruppen: null, aufrufe: 1 });
    expect(list).toHaveBeenCalledWith('drucksache', {
      'f.zuordnung': 'BT',
      'f.wahlperiode': [21],
      'f.drucksachetyp': ['Kleine Anfrage'],
    });
  });

  it('nimmt ohne Wahlperiode die 21 an und sagt es', async () => {
    const { dip, list } = dipWith(() => 5);
    const r = await countBundestag({ filters: {}, dip });
    expect(list.mock.calls[0]![1]).toMatchObject({ 'f.wahlperiode': [21] });
    expect(r.notes.join(' ')).toContain('angenommen wurde die 21');
  });

  it('gruppiert nach Fraktion: eine Abfrage je Urheber plus Gesamt', async () => {
    const { dip, list } = dipWith((_e, p) => (p['f.urheber'] ? 10 : 100));
    const r = await countBundestag({
      filters: { drucksachetyp: ['Kleine Anfrage'], wahlperiode: [21] },
      gruppieren: 'fraktion',
      dip,
    });
    expect(r.gesamt).toBe(100);
    expect(r.gruppen).toHaveLength(7);
    expect(r.gruppen![0]).toEqual({ label: 'Fraktion BÜNDNIS 90/DIE GRÜNEN', n: 10 });
    expect(list).toHaveBeenCalledTimes(8);
    expect(r.notes.join(' ')).toContain('Urheber');
  });

  it('gruppiert nach Typ innerhalb der Typliste, wenn eine gesetzt ist', async () => {
    const { dip, list } = dipWith(() => 3);
    const r = await countBundestag({
      filters: { drucksachetyp: ['Antrag', 'Gesetzentwurf'], wahlperiode: [21] },
      gruppieren: 'typ',
      dip,
    });
    expect(r.gruppen?.map((g) => g.label)).toEqual(['Antrag', 'Gesetzentwurf']);
    expect(list).toHaveBeenCalledTimes(4);
  });

  it('gruppiert nach Monat; ohne Zeitraum die letzten zwölf und ohne Wahlperiode', async () => {
    const { dip, list } = dipWith(() => 4);
    const r = await countBundestag({
      filters: {},
      gruppieren: 'monat',
      dip,
      today: new Date(Date.UTC(2026, 9, 28)),
    });
    expect(r.gruppen).toHaveLength(12);
    expect(r.gruppen![0]!.label).toBe('November 2025');
    expect(r.gruppen![11]!.label).toBe('Oktober 2026');
    expect(r.notes.join(' ')).toContain('letzten 12 Monate');
    expect(list).toHaveBeenCalledTimes(13);
    expect(list.mock.calls[1]![1]).toMatchObject({
      'f.datum.start': '2025-11-01',
      'f.datum.end': '2025-11-30',
    });
    expect(list.mock.calls[1]![1]).not.toHaveProperty('f.wahlperiode');
  });

  it('zählt bei Wahlperiode ohne Zeitraum ab Beginn der Wahlperiode und nennt das Fenster', async () => {
    // Live 28.10.2026 (z1): „in dieser Wahlperiode" ergab nur die letzten zwölf Monate.
    const { dip, list } = dipWith(() => 4);
    const r = await countBundestag({
      filters: { wahlperiode: [21], drucksachetyp: ['Kleine Anfrage'] },
      gruppieren: 'monat',
      dip,
      today: new Date(Date.UTC(2026, 9, 28)),
    });
    expect(r.gruppen).toHaveLength(20);
    expect(r.gruppen![0]!.label).toBe('März 2025');
    expect(r.gruppen![19]!.label).toBe('Oktober 2026');
    expect(r.filters.datumVon).toBe('2025-03-25');
    expect(r.notes.join(' ')).toContain('Wahlperiode 21');
    expect(r.notes.join(' ')).not.toContain('letzten 12 Monate');
    expect(list.mock.calls.length).toBeLessThanOrEqual(25);
  });

  it('kappt einen langen Zeitraum auf 24 Monate (höchstens 25 Abfragen)', async () => {
    const { dip, list } = dipWith(() => 1);
    const r = await countBundestag({
      filters: { datumVon: '2020-01-01', datumBis: '2026-10-31' },
      gruppieren: 'monat',
      dip,
    });
    expect(r.gruppen).toHaveLength(24);
    expect(list.mock.calls.length).toBeLessThanOrEqual(25);
    expect(r.notes.join(' ')).toContain('letzten 24');
  });

  it('zählt Vorgänge, sobald ein Deskriptor gesetzt ist, und ignoriert den Typ', async () => {
    const { dip, list } = dipWith(() => 7);
    const r = await countBundestag({
      filters: {
        deskriptor: ['Wärmepumpe'],
        drucksachetyp: ['Antrag'],
        urheber: ['Fraktion der SPD'],
      },
      dip,
    });
    expect(r.einheit).toBe('Vorgänge');
    expect(list).toHaveBeenCalledWith('vorgang', {
      'f.zuordnung': 'BT',
      'f.wahlperiode': [21],
      'f.initiative': ['Fraktion der SPD'],
      'f.deskriptor': ['Wärmepumpe'],
    });
    expect(r.notes.join(' ')).toContain('Vorgänge');
  });

  it('Typ-Gruppierung bei Vorgängen fällt auf die Gesamtzahl zurück', async () => {
    const { dip, list } = dipWith(() => 7);
    const r = await countBundestag({
      filters: { beratungsstand: ['Verkündet'] },
      gruppieren: 'typ',
      dip,
    });
    expect(r.gruppen).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('countBundestag: mehrere Werte', () => {
  it('zählt zwei Typen einzeln und addiert (DIP verknüpft wiederholte Werte mit UND)', async () => {
    const { dip, list } = dipWith((_e, p) =>
      (p['f.drucksachetyp'] as string[]).length > 1 ? 0 : 5
    );
    const r = await countBundestag({
      filters: { drucksachetyp: ['Antrag', 'Gesetzentwurf'], wahlperiode: [21] },
      dip,
    });
    expect(r.gesamt).toBe(10);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0]![1]).toMatchObject({ 'f.drucksachetyp': ['Antrag'] });
  });

  it('verzichtet auf die Aufteilung, wenn sie das Abfragelimit sprengt', async () => {
    const { dip, list } = dipWith(() => 1);
    const r = await countBundestag({
      filters: {
        drucksachetyp: ['Antrag', 'Gesetzentwurf', 'Bericht', 'Unterrichtung'],
        wahlperiode: [21],
      },
      gruppieren: 'fraktion',
      dip,
    });
    expect(r.gruppen).toBeNull();
    expect(r.notes.join(' ')).toContain('nur die Gesamtzahl');
    expect(list).toHaveBeenCalledTimes(4);
  });
});

describe('formatCount', () => {
  it('nennt Einheit und Tabelle', () => {
    const text = formatCount({
      einheit: 'Drucksachen',
      gesamt: 12,
      gruppen: [{ label: 'SPD', n: 5 }],
      gruppiertNach: 'fraktion',
      filters: {},
      notes: [],
      aufrufe: 2,
    });
    expect(text).toContain('12 Drucksachen');
    expect(text).toContain('| SPD | 5 |');
  });

  it('nennt bei einem Typfilter den Typ statt „Drucksachen“ und das Zeitfenster', () => {
    const text = formatCount({
      einheit: 'Drucksachen',
      gesamt: 386,
      gruppen: [{ label: 'März 2025', n: 3 }],
      gruppiertNach: 'monat',
      filters: {
        drucksachetyp: ['Kleine Anfrage'],
        wahlperiode: [21],
        datumVon: '2025-03-25',
        datumBis: '2026-10-31',
      },
      notes: [],
      aufrufe: 2,
    });
    expect(text).toContain('386 Kleine Anfragen');
    expect(text).toContain('25.03.2025');
    expect(text).toContain('31.10.2026');
    expect(text).toContain('| monat | Kleine Anfragen |');
  });
});
