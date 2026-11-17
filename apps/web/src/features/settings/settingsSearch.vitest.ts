import { describe, expect, it } from 'vitest';

import { searchSettings } from './settingsSearch';

const NAV = [
  { value: 'allgemein', label: 'Allgemein' },
  { value: 'hintergrund', label: 'Hintergrund' },
  { value: 'datenschutz', label: 'Datenschutz & Barrierefreiheit' },
  { value: 'wolke', label: 'Wolke' },
  { value: 'personalisierung', label: 'Personalisierung' },
  { value: 'erinnerungen', label: 'Erinnerungen' },
  { value: 'tagesbriefing', label: 'Tagesbriefing' },
] as const;

describe('searchSettings', () => {
  it('liefert bei leerer Eingabe nichts', () => {
    expect(searchSettings('   ', NAV)).toEqual([]);
  });

  it('faltet Umlaute: „barriere" findet Barrierefreiheit', () => {
    const hits = searchSettings('barriere', NAV);
    expect(hits[0]).toMatchObject({ tab: 'datenschutz', rowId: null });
  });

  it('findet „hintergrund" als Reiter vor allen Zeilen', () => {
    const hits = searchSettings('hintergrund', NAV);
    expect(hits[0]).toMatchObject({ tab: 'hintergrund', rowId: null });
    expect(hits.slice(1).every((h) => h.rowId !== null)).toBe(true);
  });

  it('„grunerator" findet eine Zeile mit „Grünerator"', () => {
    const hits = searchSettings('grunerator', NAV);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.rowId !== null)).toBe(true);
  });

  it('verlangt jedes Wort (UND)', () => {
    const both = searchSettings('wolke hintergrund', NAV);
    expect(both.every((h) => h.tab !== 'hintergrund' || h.rowId !== null)).toBe(true);
    expect(searchSettings('xyzzy wolke', NAV)).toEqual([]);
  });

  it('lässt Reiter aus, die nicht in der Navigation stehen', () => {
    const hits = searchSettings('wolke', [{ value: 'allgemein', label: 'Allgemein' }]);
    expect(hits.every((h) => h.tab === 'allgemein')).toBe(true);
  });

  it('deckelt auf 20 Treffer', () => {
    expect(searchSettings('e', NAV).length).toBeLessThanOrEqual(20);
  });
});
