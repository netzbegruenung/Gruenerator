import { describe, expect, it } from 'vitest';

import { LANDTAGE, resolveFilters } from './registry.js';

const be = LANDTAGE.berlin;

describe('resolveFilters (Berlin)', () => {
  it('bildet Art und Fraktion auf die Schreibweisen des Parlaments ab', () => {
    const r = resolveFilters(be, {
      typ: ['Antrag', 'Gesetzentwurf'],
      fraktion: ['gruene', 'linke'],
    });
    expect(r.typen).toEqual([
      'Antrag',
      'Antrag (Gesetzentwurf)',
      'Vorlage zur Beschlussfassung (Gesetzentwurf)',
    ]);
    expect(r.fraktionen).toEqual(['Grüne', 'Die Linke']);
    expect(r.empty).toBeNull();
    expect(r.notes).toEqual([]);
  });

  it('meldet einen nicht unterstützten Filter, statt ihn still wegzulassen', () => {
    const r = resolveFilters(be, { schlagwort: 'Verkehr' });
    expect(r.notes).toEqual([expect.stringContaining('Schlagwortfilter')]);
  });

  it('nennt nicht vertretene Fraktionen und bricht ab, wenn keine übrig bleibt', () => {
    const only = resolveFilters(be, { fraktion: ['bsw'] });
    expect(only.empty).toMatch(/BSW.*nicht vertreten/);
    expect(only.fraktionen).toEqual([]);

    const mixed = resolveFilters(be, { fraktion: ['bsw', 'spd'] });
    expect(mixed.empty).toBeNull();
    expect(mixed.fraktionen).toEqual(['SPD']);
    expect(mixed.notes).toEqual([expect.stringMatching(/BSW/)]);
  });

  it('merkt sich, dass die Art Anfragen enthält (Fraktion steht dort an der Person)', () => {
    expect(resolveFilters(be, { typ: ['Anfrage'] }).mitAnfrage).toBe(true);
    expect(resolveFilters(be, { typ: ['Antrag'] }).mitAnfrage).toBe(false);
  });

  it('lässt Zeitraum, Wahlperiode, Titel und Volltext durch', () => {
    const r = resolveFilters(be, {
      wahlperiode: 19,
      datumVon: '2026-01-01',
      datumBis: '2026-12-31',
      titel: 'Rad',
      volltext: 'Kiezblock',
    });
    expect(r).toMatchObject({
      wahlperiode: 19,
      datumVon: '2026-01-01',
      datumBis: '2026-12-31',
      titel: 'Rad',
      volltext: 'Kiezblock',
      notes: [],
    });
  });
});

describe('Registry', () => {
  it('trägt zu jedem Parlament Präfix und Lizenz-Quellenangabe', () => {
    for (const meta of Object.values(LANDTAGE)) {
      expect(meta.refPrefix).toMatch(/^[A-Z]{2}$/);
      expect(meta.quellenangabe).toMatch(/^Quelle: /);
    }
    expect(be.quellenangabe).toBe('Quelle: Abgeordnetenhaus Berlin, PARDOK, DL-DE BY 2.0');
  });
});
