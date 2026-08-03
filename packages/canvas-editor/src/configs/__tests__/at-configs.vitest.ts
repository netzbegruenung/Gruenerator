import { describe, it, expect, beforeAll } from 'vitest';

import { getBrandTheme } from '../../brand/theme';
import { loadCanvasConfig } from '../configLoader';
import { getTemplatesForLocale } from '../../utils/templateRegistry';
import { ZITAT_AT_CONFIG, calculateZitatAtLayout } from '../../utils/zitatAtLayout';
import { ZITAT_PURE_AT_CONFIG, calculateZitatPureAtLayout } from '../../utils/zitatPureAtLayout';
import { INFO_AT_CONFIG, calculateInfoAtLayout } from '../../utils/infoAtLayout';
import { OVERLAY_AT_CONFIG, calculateOverlayAtLayout } from '../../utils/overlayAtLayout';
import { measureTextWidthWithFont } from '../../utils/textUtils';

const AT_IDS = [
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
] as const;

describe('Österreich (de-AT) canvas configs', () => {
  // Der erste dynamische Import zieht die gesamte Konva-Kette nach. Diese
  // Kette ist allen Sujets gemeinsam, der Preis faellt also genau einmal an —
  // gemessen 2189 ms fuer das zuerst geladene Sujet, 3-7 ms fuer jedes
  // weitere. Solange er im ersten Testfall lag, trug ein einzelner Fall die
  // Last des ganzen Blocks: mit 5 s riss er in etwa zwei von drei Laeufen,
  // und auch mit 20 s noch auf den langsameren CI-Runnern (gemessen 20653 ms).
  //
  // Den Kaltstart hierher zu ziehen macht ihn zu dem, was er ist: Ruestzeit
  // des Blocks, nicht Laufzeit eines Falls. Die Fallgrenzen duerfen damit
  // wieder eng sein und messen echte Regressionen statt Modulaufloesung.
  beforeAll(async () => {
    await loadCanvasConfig(AT_IDS[0]);
  }, 120_000);

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
    // Beide Locales haben ein Info-Sujet, aber es sind zwei verschiedene:
    // 'info' fuer de-DE, 'info-at' fuer de-AT. Keines taucht beim anderen auf.
    expect(at.filter((id) => id.startsWith('info'))).toEqual(['info-at']);
    expect(de.filter((id) => id.startsWith('info'))).toEqual(['info']);
  });

  it('Info AT setzt Introline, Infotext und gelbe Schlusszeile', async () => {
    const info = await loadCanvasConfig('info-at');

    // Logo rechts oben — anders als bei den uebrigen Flaechen-Sujets.
    expect(info.elements.find((e) => e.id === 'logo')).toBeDefined();

    // Drei mittige Textzonen, die gelbe traegt Vollkorn kursiv.
    for (const id of ['introline-text', 'text-text', 'accent-text']) {
      expect((info.elements.find((e) => e.id === id) as { align?: string }).align).toBe('center');
    }
    const accent = info.elements.find((e) => e.id === 'accent-text') as {
      fontStyle?: string;
      fontFamily?: string;
      fill?: string;
    };
    expect(accent.fontStyle).toBe('italic');
    expect(accent.fontFamily).toContain('Vollkorn');
    expect(accent.fill).toBe('#FCEC00');

    // Alle drei Zonen sind KI-editierbar — sonst bliebe die Schlusszeile stumm.
    const fields = info.ai
      ?.describeForAi(info.createInitialState({}))
      .textFields.map((f) => f.field);
    expect(fields).toEqual(['introline', 'text', 'accent']);
  });

  it('laesst kurze Aussagen wachsen und lange weichen', () => {
    const kurz = calculateInfoAtLayout('Wien, 29. Juli', 'Sauberer Strom ist', 'billiger.');
    const lang = calculateInfoAtLayout(
      'Eine Introline steht hier.',
      'Hier steht ein laengerer Infotext, zum Beispiel ein Zitat oder eine',
      'Infoheadline.'
    );
    expect(kurz.zones[1].fontSize).toBeGreaterThan(lang.zones[1].fontSize);
    expect(kurz.zones[1].fontSize).toBeLessThanOrEqual(INFO_AT_CONFIG.text.maxFontSize);
    expect(lang.zones[1].fontSize).toBeGreaterThanOrEqual(INFO_AT_CONFIG.text.minFontSize);

    // Der gemeinsame Faktor haelt das Verhaeltnis Introline zu Infotext stabil.
    const ratio = (l: ReturnType<typeof calculateInfoAtLayout>) =>
      l.zones[0].fontSize / l.zones[1].fontSize;
    expect(Math.abs(ratio(kurz) - ratio(lang))).toBeLessThan(0.02);

    // Beide bleiben innerhalb der Satzhoehe.
    for (const l of [kurz, lang]) {
      expect(l.zones[0].y).toBeGreaterThanOrEqual(INFO_AT_CONFIG.topBoundary - 1);
      expect(l.zones[2].y).toBeLessThan(INFO_AT_CONFIG.bottomBoundary);
    }
  });

  it('schrumpft, wenn ein einzelnes Wort breiter als die Spalte ist', () => {
    // Aus dem Realtest (Mistral Medium 3.5): „unabhängigkeit" misst in Vollkorn
    // kursiv bei 118 px 824 px gegen 760 px Satzmaß. Konva brach daraufhin
    // MITTEN im Wort, waehrend wrapTextAccurate — das nur an Leerzeichen bricht
    // — es weiter als eine Zeile meldete. Die Wachstumsschleife prueft die
    // Wortbreite nur fuer den NAECHSTEN Schritt, die Ausgangsgroesse selbst
    // wurde nie geprueft.
    const l = calculateInfoAtLayout(
      'Österreichs Strommix',
      '87 Prozent kommen bereits aus Erneuerbaren mehr',
      'unabhängigkeit'
    );
    expect(l.zones[2].fontSize).toBeLessThan(INFO_AT_CONFIG.text.fontSize);
    const breite = measureTextWidthWithFont(
      'unabhängigkeit',
      l.zones[2].fontSize,
      INFO_AT_CONFIG.accent.fontFamily,
      INFO_AT_CONFIG.accent.fontStyle
    );
    expect(breite).toBeLessThanOrEqual(INFO_AT_CONFIG.maxWidth);
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

    // Ueber dem Foto liegt nichts — die AT-CI kennt keinen Verlauf, schon gar
    // keinen gruenen. Das deutsche Zitat setzt dagegen weiterhin einen.
    expect(zitat.elements.find((e) => e.id === 'gradient-overlay')).toBeUndefined();
    const de = await loadCanvasConfig('zitat');
    expect(de.elements.find((e) => e.id === 'gradient-overlay')).toBeDefined();
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

  it('Zitat auf Flaeche setzt eigenstaendig, nicht in deutschem Grad', async () => {
    const pure = await loadCanvasConfig('zitat-pure-at');

    // Weisses Anfuehrungszeichen — Gelb zeigt die Guideline nur auf dem Foto.
    const mark = pure.elements.find((e) => e.id === 'quote-mark');
    expect((mark as { src?: string } | undefined)?.src).toBe('/quote-white.svg');

    // Kein Logo: die Flaechen-Sujets tragen keines, nur die mit Foto.
    expect(pure.elements.find((e) => e.id === 'logo')).toBeUndefined();

    // Satzspiegel bleibt innerhalb der Blattraender.
    const rechts = ZITAT_PURE_AT_CONFIG.margin + ZITAT_PURE_AT_CONFIG.maxWidth;
    expect(rechts).toBeLessThanOrEqual(
      ZITAT_PURE_AT_CONFIG.canvas.width - ZITAT_PURE_AT_CONFIG.margin
    );
  });

  it('haelt den Namen am Zitat und faengt kurze wie lange Zitate ab', () => {
    const lang = calculateZitatPureAtLayout(
      'Ein etwas laengeres Zitat einer Person zu einem tagesaktuellen Thema fuer ein Shareable.',
      'Name Nachname'
    );
    const kurz = calculateZitatPureAtLayout('Ein kurzes Zitat.', 'Name Nachname');

    // Der Abstand zum Namen haengt am Schriftgrad, nicht an einer geschaetzten
    // Zeilenzahl — vorher schwebte der Name gut 200 px unter dem Zitat.
    const lueckeLang = lang.authorY - (lang.quoteY + lang.quoteLines.length * lang.lineHeight);
    expect(lueckeLang).toBe(Math.round(lang.quoteFontSize * 0.61));

    // Kurze Zitate wachsen bis an die Obergrenze, lange bleiben im Rahmen.
    expect(kurz.quoteFontSize).toBeGreaterThan(lang.quoteFontSize);
    expect(kurz.quoteFontSize).toBeLessThanOrEqual(ZITAT_PURE_AT_CONFIG.quote.maxFontSize);
    expect(lang.quoteLines.length).toBeLessThanOrEqual(ZITAT_PURE_AT_CONFIG.quote.maxLines);

    // Beide sitzen mittig auf dem Blatt.
    const ziel = ZITAT_PURE_AT_CONFIG.canvas.height * ZITAT_PURE_AT_CONFIG.groupCenterRatio;
    for (const l of [lang, kurz]) {
      const mitte = (l.quoteMarkY + l.authorY + l.authorFontSize) / 2;
      expect(Math.abs(mitte - ziel)).toBeLessThan(20);
    }
  });

  it('laesst das Autofit auch laufen, wenn die Faktory null statt undefined setzt', () => {
    // createInitialState setzt customPrimaryFontSize auf `null`; eine Pruefung
    // auf `undefined` haette das Autofit stumm nie ausgefuehrt.
    const mitNull = calculateZitatPureAtLayout('Ein kurzes Zitat.', 'Name', null);
    const ohne = calculateZitatPureAtLayout('Ein kurzes Zitat.', 'Name');
    expect(mitNull.quoteFontSize).toBe(ohne.quoteFontSize);
    expect(mitNull.quoteFontSize).toBeGreaterThan(ZITAT_PURE_AT_CONFIG.quote.fontSize);

    // Ein ausdruecklicher Grad schaltet das Autofit dagegen ab.
    expect(calculateZitatPureAtLayout('Ein kurzes Zitat.', 'Name', 50).quoteFontSize).toBe(50);
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

  it('schrumpft das Overlay, bis jede Headline-Zeile auf eine Zeile passt', () => {
    // Die Box verengt das Satzmass auf 720 px; bei der Startgroesse von 118 px
    // passen dort nur rund zwoelf Zeichen. Die Hoehenpruefung allein liess
    // „Mehr Windkraft" umbrechen — vier Zeilen stehen vertikal noch bequem in
    // der Box, aus dem Dreizeiler wurde ein Absatz.
    const O = OVERLAY_AT_CONFIG;
    const headline = (text: string) => ({
      text,
      fontSize: O.headline.fontSize,
      fontFamily: O.headline.fontFamily,
      fontStyle: O.headline.fontStyle,
    });
    const layout = calculateOverlayAtLayout([
      headline('Mehr Windkraft'),
      {
        text: 'für Österreich',
        fontSize: O.accent.fontSize,
        fontFamily: O.accent.fontFamily,
        fontStyle: O.accent.fontStyle,
      },
      headline('und für uns'),
      {
        text: '',
        fontSize: O.subline.fontSize,
        fontFamily: O.subline.fontFamily,
        fontStyle: O.subline.fontStyle,
      },
    ]);

    expect(layout.zones[0].fontSize).toBeLessThan(O.headline.fontSize);
    const breite = measureTextWidthWithFont(
      'Mehr Windkraft',
      layout.zones[0].fontSize,
      O.headline.fontFamily,
      O.headline.fontStyle
    );
    expect(breite).toBeLessThanOrEqual(O.maxWidth);
  });
});
