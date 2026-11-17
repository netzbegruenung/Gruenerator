import { describe, expect, it } from 'vitest';

import { searchSettings } from './settingsSearch';

const NAV = [
  { value: 'allgemein', label: 'Allgemein' },
  { value: 'hintergrund', label: 'Hintergrund' },
  { value: 'konto', label: 'Konto' },
  { value: 'datenschutz', label: 'Datenschutz' },
  { value: 'wolke', label: 'Wolke' },
  { value: 'personalisierung', label: 'Personalisierung' },
  { value: 'erinnerungen', label: 'Erinnerungen' },
  { value: 'tagesbriefing', label: 'Tagesbriefing' },
] as const;

describe('searchSettings', () => {
  it('liefert bei leerer Eingabe nichts', () => {
    expect(searchSettings('   ', NAV)).toEqual([]);
  });

  it('faltet Umlaute: „barriere" findet den Reiter mit den Bedienungshilfen', () => {
    expect(searchSettings('barriere', NAV)[0]).toMatchObject({ tab: 'allgemein', rowId: null });
  });

  it('findet einen Reiter über seinen früheren Namen', () => {
    const nav = [...NAV, { value: 'konnektoren', label: 'Konnektoren' }] as const;
    expect(searchSettings('mcp', nav)[0]).toMatchObject({
      tab: 'konnektoren',
      title: 'Konnektoren',
      rowId: null,
    });
  });

  it('findet die Bedienungshilfen in Allgemein, nicht mehr in Datenschutz', () => {
    const hits = searchSettings('animationen reduzieren', NAV);
    expect(hits[0]).toMatchObject({ tab: 'allgemein', rowId: 'barrierefreiheit.animationen' });
    expect(hits.some((h) => h.tab === 'datenschutz')).toBe(false);
  });

  it('findet den Papierkorb im Konto', () => {
    expect(searchSettings('papierkorb', NAV)[0]).toMatchObject({
      tab: 'konto',
      rowId: 'allgemein.papierkorb',
    });
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
    // Jedes Wort für sich trifft mehrere Zeilen, beide zusammen nur eine.
    expect(searchSettings('allgemein', NAV).length).toBeGreaterThan(1);
    expect(searchSettings('stimme', NAV).length).toBeGreaterThan(0);
    expect(searchSettings('allgemein stimme', NAV).map((h) => h.key)).toEqual(['allgemein.stimme']);
    expect(searchSettings('xyzzy wolke', NAV)).toEqual([]);
  });

  it('lässt Zeilen aus, deren Reiter nicht in der Navigation steht', () => {
    // allgemein.stimme gehört zu „allgemein" — das hier nicht mitgegeben wird.
    expect(searchSettings('stimme', NAV).some((h) => h.rowId === 'allgemein.stimme')).toBe(true);
    const withoutAllgemein = NAV.filter((e) => e.value !== 'allgemein');
    expect(searchSettings('stimme', withoutAllgemein)).toEqual([]);
  });

  it('deckelt auf 20 Treffer', () => {
    expect(searchSettings('e', NAV).length).toBeLessThanOrEqual(20);
  });
});
