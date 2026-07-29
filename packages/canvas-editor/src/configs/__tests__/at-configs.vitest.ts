import { describe, it, expect } from 'vitest';

import { getBrandTheme } from '../../brand/theme';
import { loadCanvasConfig } from '../configLoader';
import { getTemplatesForLocale } from '../../utils/templateRegistry';

const AT_IDS = [
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-at',
  'dreizeilen-overlay-at',
  'freeform-at',
] as const;

describe('Österreich (de-AT) canvas configs', () => {
  it.each(AT_IDS)('loads and builds config %s', async (id) => {
    const config = await loadCanvasConfig(id);
    expect(config).toBeTruthy();
    expect(config.id).toBe(id);
    expect(Array.isArray(config.elements)).toBe(true);
    expect(config.elements.length).toBeGreaterThan(0);
    // createInitialState must not throw
    const state = config.createInitialState({});
    expect(state).toBeTruthy();
  });

  it('brand theme exposes AT tokens', () => {
    const at = getBrandTheme('de-AT');
    expect(at.colors.primary).toBe('#257639');
    expect(at.colors.secondary).toBe('#56af31');
    expect(at.colors.accent).toBe('#FCEC00');
    expect(at.colors.stoerer).toBe('#E4007C');
    expect(at.fonts.headline).toBe('GothamNarrow-Ultra');
    // Zitate tragen denselben Display-Schnitt wie Headlines und Untertitel.
    expect(at.fonts.quoteShort).toBe('GothamNarrow-Ultra');
    expect(at.fonts.quoteEmphasis).toBe('Vollkorn');
    expect(at.logo?.src).toContain('gruene-at-logo');
  });

  it('getTemplatesForLocale gates AT vs DE', () => {
    const at = getTemplatesForLocale('de-AT').map((t) => t.id);
    const de = getTemplatesForLocale('de-DE').map((t) => t.id);
    expect(at).toEqual(expect.arrayContaining([...AT_IDS]));
    expect(de).toContain('info');
    // Info gibt es ausschliesslich für de-DE — für AT existiert gar kein Sujet,
    // weder 'info' noch ein 'info-at'.
    expect(at.filter((id) => id.startsWith('info'))).toEqual([]);
  });

  it('kennt kein info-at mehr', async () => {
    await expect(loadCanvasConfig('info-at' as never)).rejects.toThrow();
  });

  it('Fläche traegt kein Logo — die CI setzt sie als reine Typografie', async () => {
    const flaeche = await loadCanvasConfig('dreizeilen-at');
    expect(flaeche.elements.find((e) => e.id === 'logo')).toBeUndefined();
    // Die Overlay-Variante dagegen schon, mittig in der Farbflaeche.
    const overlay = await loadCanvasConfig('dreizeilen-overlay-at');
    expect(overlay.elements.find((e) => e.id === 'logo')).toBeDefined();
    expect(overlay.elements.find((e) => e.id === 'overlay-box')?.type).toBe('rect');
  });

  it('macht alle vier Textzonen KI-editierbar', async () => {
    // Ohne eigene Setter fehlten `accent` und `line3` in describeForAi, die
    // gelbe Betonungszeile war fuer die KI unsichtbar.
    const overlay = await loadCanvasConfig('dreizeilen-overlay-at');
    const fields = overlay.ai
      ?.describeForAi(overlay.createInitialState({}))
      .textFields.map((f) => f.field);
    expect(fields).toEqual(['line1', 'accent', 'line3', 'subline']);

    const flaeche = await loadCanvasConfig('dreizeilen-at');
    const flaecheFields = flaeche.ai
      ?.describeForAi(flaeche.createInitialState({}))
      .textFields.map((f) => f.field);
    expect(flaecheFields).toEqual(['line1', 'accent', 'line3']);
  });
});
