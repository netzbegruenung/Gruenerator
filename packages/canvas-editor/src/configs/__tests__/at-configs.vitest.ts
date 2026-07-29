import { describe, it, expect } from 'vitest';

import { getBrandTheme } from '../../brand/theme';
import { loadCanvasConfig } from '../configLoader';
import { getTemplatesForLocale } from '../../utils/templateRegistry';
import { ZITAT_AT_CONFIG, calculateZitatAtLayout } from '../../utils/zitatAtLayout';

const AT_IDS = [
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-at',
  'dreizeilen-overlay-at',
  'freeform-at',
] as const;

describe('Österreich (de-AT) canvas configs', () => {
  // Der erste dynamische Import zieht die gesamte Konva-Kette nach und reisst
  // die 5-Sekunden-Vorgabe in etwa zwei von drei Laeufen — der Fall sah wie
  // Flakiness aus, ist aber schlicht Kaltstart des ersten geladenen Sujets.
  it.each(AT_IDS)(
    'loads and builds config %s',
    async (id) => {
      const config = await loadCanvasConfig(id);
      expect(config).toBeTruthy();
      expect(config.id).toBe(id);
      expect(Array.isArray(config.elements)).toBe(true);
      expect(config.elements.length).toBeGreaterThan(0);
      // createInitialState must not throw
      const state = config.createInitialState({});
      expect(state).toBeTruthy();
    },
    20_000
  );

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

  it('Zitat auf Foto folgt der AT-Guideline, nicht der deutschen Geometrie', async () => {
    const zitat = await loadCanvasConfig('zitat-at');

    // Logo rechts oben — das deutsche Zitat traegt keines.
    const logo = zitat.elements.find((e) => e.id === 'logo');
    expect(logo).toBeDefined();
    expect(logo?.x).toBe(ZITAT_AT_CONFIG.canvas.width - 70 - ZITAT_AT_CONFIG.logo.width);

    // Gelbes Anfuehrungszeichen statt des weissen aus der DE-Konfiguration.
    const mark = zitat.elements.find((e) => e.id === 'quote-mark');
    expect((mark as { src?: string } | undefined)?.src).toBe('/quote-gelb.svg');

    // Zitat und Name stehen mittig.
    for (const id of ['quote-text', 'name-text']) {
      expect((zitat.elements.find((e) => e.id === id) as { align?: string }).align).toBe('center');
    }

    // Der Verlauf ist ein echter Verlauf in Dunkelgruen, kein flacher Schleier.
    const scrim = zitat.elements.find((e) => e.id === 'gradient-overlay') as
      { fillLinearGradientColorStops?: Array<number | string> } | undefined;
    expect(scrim?.fillLinearGradientColorStops?.length).toBeGreaterThan(4);
    expect(String(scrim?.fillLinearGradientColorStops?.[1])).toContain('37, 118, 57');
  });

  it('zentriert den Zitatblock als Gruppe statt ihn am Blattboden zu verankern', () => {
    const kurz = calculateZitatAtLayout('Kurz.', 'Name Nachname');
    const lang = calculateZitatAtLayout(
      'Ein deutlich laengeres Zitat einer Person zu einem tagesaktuellen Thema, das ueber mehrere Zeilen laeuft und trotzdem mittig sitzen soll.',
      'Name Nachname'
    );
    const mitte = (l: ReturnType<typeof calculateZitatAtLayout>) =>
      (l.quoteMarkY + l.authorY + l.authorFontSize) / 2;
    const ziel = ZITAT_AT_CONFIG.canvas.height * ZITAT_AT_CONFIG.groupCenterRatio;
    expect(Math.abs(mitte(kurz) - ziel)).toBeLessThan(20);
    expect(Math.abs(mitte(lang) - ziel)).toBeLessThan(20);
    // Und der laengere Block waechst nach beiden Seiten, nicht nur nach unten.
    expect(lang.quoteMarkY).toBeLessThan(kurz.quoteMarkY);
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
