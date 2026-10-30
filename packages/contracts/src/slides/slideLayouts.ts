/**
 * Folienlayouts der Präsentationen: die 16 Beispielfolien des Grünen
 * Präsentations-CD (dunkel auf Tanne, hell auf Sand), als fertiger Zustand
 * einer freien Seite (`freeform` / `freeform-at`) auf 1920 × 1080.
 *
 * Jede Folie besteht nur aus Elementen, die der Editor ohnehin kennt — Texte,
 * Formen, Grafiken, Diagramme, das Hintergrundfoto — und bleibt damit frei
 * bearbeitbar. Texte, Formen, Diagramme und Fotos gehen nativ ins PPTX; nur
 * Sonnenblume und Logo (Grafiken) werden gerastert.
 *
 * Österreich nimmt dieselbe Geometrie mit dem AT-CI (Farben, Gotham, Logo
 * statt Sonnenblume). Die Layout-Ids sind F1: sie können persistiert werden.
 */

import {
  ASSET_TARGET_SIZE,
  type AdditionalText,
  type AssetInstance,
  type ChartInstance,
  type CircleBadgeInstance,
  type IconState,
  type PillBadgeInstance,
  type ShapeInstance,
  type TextAccent,
  type UserImageInstance,
} from '@ggraphic/core';

import {
  SHAREPIC_COLOR_HEX,
  getBrandPack,
  getBrandTheme,
  type BrandLocale,
} from '../brand/grueneBrand.js';

import { type DeckStilId } from './deckStile/index.js';

export const SLIDE_LAYOUTS = [
  { id: 'titel', label: 'Titelfolie', theme: 'dunkel' },
  { id: 'titel-bild', label: 'Titelfolie mit Bild', theme: 'dunkel' },
  { id: 'text-bild', label: 'Text & Bild', theme: 'dunkel' },
  { id: 'bild-text', label: 'Bild & Text', theme: 'dunkel' },
  { id: 'textfolie', label: 'Textfolie', theme: 'dunkel' },
  { id: 'diagramm', label: 'Diagramm', theme: 'dunkel' },
  { id: 'zitat', label: 'Zitat', theme: 'dunkel' },
  { id: 'zitat-bild', label: 'Zitat mit Bild', theme: 'dunkel' },
  { id: 'bildfolie', label: 'Bildfolie', theme: 'dunkel' },
  { id: 'danke', label: 'Vielen Dank', theme: 'dunkel' },
  { id: 'titel-hell', label: 'Titelfolie', theme: 'hell' },
  { id: 'text-bild-hell', label: 'Text & Bild', theme: 'hell' },
  { id: 'bild-text-hell', label: 'Bild & Text', theme: 'hell' },
  { id: 'textfolie-hell', label: 'Textfolie', theme: 'hell' },
  { id: 'diagramm-hell', label: 'Diagramm', theme: 'hell' },
  { id: 'zitat-hell', label: 'Zitat', theme: 'hell' },
] as const;

export type SlideLayoutId = (typeof SLIDE_LAYOUTS)[number]['id'];
export type SlideLayoutTheme = (typeof SLIDE_LAYOUTS)[number]['theme'];
export type SlideLayoutInfo = (typeof SLIDE_LAYOUTS)[number];

/** Die Folie, mit der eine leere Präsentation beginnt. */
export const DEFAULT_SLIDE_LAYOUT: SlideLayoutId = 'titel';

/**
 * Zustand einer freien Seite, wie `createInitialState` ihn liest. Aus Kern-Typen
 * gebaut, damit der Server ihn laden kann; der Editor nimmt ihn als
 * `ComposedSlide & { lockedLayerIds; notes }` an (Typtest in canvas-editor).
 */
export type SlideLayoutState = {
  backgroundMode: 'color' | 'image';
  backgroundColor: string;
  currentImageSrc?: string;
  hasBackgroundImage: boolean;
  imageOffset: { x: number; y: number };
  imageScale: number;
  imageAttribution: null;
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  shapeInstances: ShapeInstance[];
  assetInstances: AssetInstance[];
  chartInstances: ChartInstance[];
  userImageInstances: UserImageInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  layerOrder: string[];
  lockedLayerIds: string[];
  notes: string;
  /** Id der Deck-Vorlage (Stil), die die Seite gebaut hat; fehlt bei Seiten ohne Vorlage. */
  deckStil?: DeckStilId;
};

export interface SlideLayoutOptions {
  locale: BrandLocale;
  /** Steht unten rechts; die Nummer, die die neue Seite bekommt. */
  pageNumber: number;
  /** Datum in der Fußzeile. */
  date: Date;
}

/** Die freie Vorlage, auf der die Folien eines Landes liegen. */
export function slideLayoutConfigId(locale: BrandLocale): 'freeform' | 'freeform-at' {
  return locale === 'de-AT' ? 'freeform-at' : 'freeform';
}

// ============================================================================
// MASSE — gemessen an den CD-Beispielfolien (1920 × 1080)
// ============================================================================

const W = 1920;
const H = 1080;
/** Linker und rechter Rand der Inhalte. */
const M = 90;
/** Breite der Farbfläche neben dem Foto (Text & Bild). */
const PANEL = 960;
/** Innenabstand der Texte in der Farbfläche. */
const PANEL_PAD = 80;
const HEAD_TOP = 60;
const FOOTER = { y: 1028, size: 20 } as const;
const STOERER = { diameter: 300, size: 46 } as const;
const MARK = { x: 1852, y: 62, diameter: 60, flower: 44, atLogo: 96 } as const;

/** Stockfotos des Creators; über die normale Bildauswahl ersetzbar. */
const PHOTO = {
  sonnenblume: '/api/image-picker/stock-image/mike-marrah-vKNjdRBqep0-unsplash.jpg',
  abend: '/api/image-picker/stock-image/daiga-ellaby-f4i5EP2TVMk-unsplash.jpg',
} as const;

// ============================================================================
// FARBEN UND SCHRIFTEN JE LAND UND GRUND
// ============================================================================

const brand = (id: string): string => getBrandPack('de-DE').palette.find((c) => c.id === id)!.color;

const DE = getBrandTheme('de-DE');
const AT = getBrandTheme('de-AT');

/**
 * Magenta hat nur das AT-CI als Token; der Präsentations-CD setzt denselben
 * Störer auch in Deutschland. Blau ist „Himmel".
 */
const STOERER_FILL = { magenta: AT.colors.stoerer, blau: brand('himmel') } as const;

type Grund = 'dunkel' | 'hell' | 'foto';

interface Ink {
  /** Farbe der Seite; beim Foto die Farbe dahinter. */
  ground: string;
  text: string;
  /** Wie `==Akzent==` aussieht; null: wie der übrige Text. */
  accent: TextAccent | null;
  /** Kontur der großen Anführungszeichen. */
  quote: string;
  /** Die große Sonnenblume der Titelfolie; null in Österreich. */
  watermark: { assetId: string; opacity: number } | null;
  /** Das Zeichen oben rechts: ein Kreis mit Sonnenblume (DE) bzw. das Logo (AT). */
  mark: { circle: string | null; assetId: string; size: number };
  logoAssetId: string;
  headline: string;
  body: string;
}

function inkFor(locale: BrandLocale, grund: Grund): Ink {
  const theme = locale === 'de-AT' ? AT : DE;
  const fonts = { headline: theme.fonts.headline, body: theme.fonts.body };
  if (locale === 'de-AT') {
    // AT-Betonung: Vollkorn Black Italic, auf Dunkelgrün in Gelb.
    const emphasis = { fontFamily: AT.fonts.quoteEmphasis, fontStyle: 'bold italic' as const };
    const light = grund === 'hell';
    return {
      ground: light ? SHAREPIC_COLOR_HEX.weiss : AT.colors.primary,
      text: light ? AT.colors.textOnLight : AT.colors.textOnDark,
      accent:
        grund === 'foto'
          ? null
          : { ...emphasis, fill: light ? AT.colors.textOnLight : AT.colors.accent },
      quote: light
        ? AT.colors.secondary
        : grund === 'foto'
          ? AT.colors.textOnDark
          : AT.colors.accent,
      watermark: null,
      mark: {
        circle: null,
        assetId: light ? 'gruene-at-logo-gruen' : 'gruene-at-logo-weiss',
        size: MARK.atLogo,
      },
      logoAssetId: light ? 'gruene-at-logo-gruen' : 'gruene-at-logo-weiss',
      ...fonts,
    };
  }
  const sand = DE.backgroundColors.find((c) => c.id === 'sand')!.color;
  if (grund === 'hell') {
    return {
      ground: sand,
      text: DE.colors.textOnLight,
      // Klee statt Grashalm: Grashalm hielte auf Sand nur 2:1.
      accent: { fill: DE.colors.accentOnLight },
      quote: brand('grashalm'),
      watermark: { assetId: 'sunflower-weiss', opacity: 0.9 },
      mark: { circle: DE.colors.primary, assetId: 'sunflower-weiss', size: MARK.flower },
      logoAssetId: 'gruene-de-logo-schwarz',
      ...fonts,
    };
  }
  return {
    ground: DE.colors.primary,
    text: DE.colors.textOnDark,
    accent: grund === 'foto' ? null : { fill: brand('grashalm') },
    quote: brand('grashalm'),
    watermark: { assetId: 'sunflower-weiss', opacity: 0.12 },
    mark: { circle: SHAREPIC_COLOR_HEX.weiss, assetId: 'sunflower-green', size: MARK.flower },
    // Die Farbfassung (sandfarbene Schrift, gelbe Blume) ist für dunkle Gründe.
    logoAssetId: 'gruene-de-logo',
    ...fonts,
  };
}

// ============================================================================
// BAUSTEINE
// ============================================================================

interface TextOptions {
  type?: AdditionalText['type'];
  family?: string;
  fill?: string;
  align?: AdditionalText['align'];
  lineHeight?: number;
  accent?: TextAccent | null;
  stroke?: { color: string; width: number };
}

/** Die Seite, in die ein Layout seine Elemente legt; `layerOrder` von hinten nach vorn. */
export class SlideBuilder {
  readonly state: SlideLayoutState;

  constructor(
    readonly ink: Ink,
    photo: string | null
  ) {
    this.state = {
      backgroundMode: photo ? 'image' : 'color',
      backgroundColor: ink.ground,
      ...(photo ? { currentImageSrc: photo } : {}),
      hasBackgroundImage: !!photo,
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
      imageAttribution: null,
      additionalTexts: [],
      pillBadgeInstances: [],
      circleBadgeInstances: [],
      shapeInstances: [],
      assetInstances: [],
      chartInstances: [],
      userImageInstances: [],
      selectedIcons: [],
      iconStates: {},
      layerOrder: [],
      lockedLayerIds: [],
      notes: '',
    };
  }

  text(
    id: string,
    value: string,
    x: number,
    y: number,
    width: number,
    size: number,
    o: TextOptions = {}
  ) {
    const text: AdditionalText = {
      id,
      text: value,
      type: o.type ?? 'body',
      x,
      y,
      width,
      fontSize: size,
      fontFamily: o.family ?? this.ink.body,
      fontStyle: 'normal',
      fill: o.fill ?? this.ink.text,
      ...(o.align && o.align !== 'left' ? { align: o.align } : {}),
      ...(o.lineHeight ? { lineHeight: o.lineHeight } : {}),
      ...(o.accent ? { accent: o.accent } : {}),
      ...(o.stroke ? { stroke: o.stroke.color, strokeWidth: o.stroke.width } : {}),
    };
    this.state.additionalTexts.push(text);
    this.state.layerOrder.push(id);
  }

  headline(id: string, value: string, x: number, y: number, width: number, size: number) {
    this.text(id, value, x, y, width, size, {
      type: 'header',
      family: this.ink.headline,
      lineHeight: 1.05,
    });
  }

  /** Rechteck oder Kreis um ihren Mittelpunkt, wie der Editor Formen speichert. */
  shape(
    id: string,
    type: 'rect' | 'circle',
    cx: number,
    cy: number,
    w: number,
    h: number,
    fill: string
  ) {
    const shape: ShapeInstance = {
      id,
      type,
      x: cx,
      y: cy,
      width: w,
      height: h,
      fill,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    };
    this.state.shapeInstances.push(shape);
    this.state.layerOrder.push(id);
  }

  /** Eine Grafik, deren längere Seite `size` misst, mittig auf (cx, cy). */
  asset(id: string, assetId: string, cx: number, cy: number, size: number, opacity = 1) {
    const asset: AssetInstance = {
      id,
      assetId,
      x: cx,
      y: cy,
      scale: size / ASSET_TARGET_SIZE,
      rotation: 0,
      opacity,
    };
    this.state.assetInstances.push(asset);
    this.state.layerOrder.push(id);
  }

  chart(chart: ChartInstance) {
    this.state.chartInstances.push(chart);
    this.state.layerOrder.push(chart.id);
  }

  lock(id: string) {
    this.state.lockedLayerIds.push(id);
  }
}

function footer(b: SlideBuilder, o: SlideLayoutOptions) {
  const date = new Intl.DateTimeFormat(o.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(o.date);
  b.text('folie-datum', date, M, FOOTER.y, 600, FOOTER.size);
  b.text('folie-titel', 'Beispielfolie', 864, FOOTER.y, 600, FOOTER.size);
  b.text('folie-seitenzahl', String(o.pageNumber), W - M - 200, FOOTER.y, 200, FOOTER.size, {
    align: 'right',
  });
}

function mark(b: SlideBuilder) {
  const { circle, assetId, size } = b.ink.mark;
  if (circle)
    b.shape('folie-zeichen-kreis', 'circle', MARK.x, MARK.y, MARK.diameter, MARK.diameter, circle);
  b.asset('folie-zeichen', assetId, MARK.x, MARK.y, size);
}

function stoerer(b: SlideBuilder, cx: number, cy: number, fill: string) {
  const d = STOERER.diameter;
  b.shape('folie-stoerer', 'circle', cx, cy, d, d, fill);
  const lines = 3;
  b.text(
    'folie-stoerer-text',
    'Hier steht\nder Störer-\nText.',
    cx - d * 0.43,
    cy - (lines * STOERER.size) / 2,
    d * 0.86,
    STOERER.size,
    { family: b.ink.headline, fill: SHAREPIC_COLOR_HEX.weiss, align: 'center', lineHeight: 1 }
  );
}

const TITEL_TEXT =
  'Verwende auf der ersten Folie eine große Headline – denn großzügige Titelfolien schaffen Aufmerksamkeit. **Versuche Inhalte grundsätzlich auf das Wesentliche zu reduzieren.** Niemand liest gern Romane in einer PowerPoint-Präsentation.';

const TEXT_BILD_TEXT =
  '• Hier könnten ein paar deiner Gedanken stehen. Teile Punkte lieber auf mehrere Slides auf und verwende Fotos, um deine Punkte zu illustrieren.';

const ZITAT_INTRO = 'Zusammenbringen, was zusammen gehört:';
/** Auf dem Foto ohne Betonung, umbrochen wie im CD. */
const ZITAT_TEXT_FOTO =
  'Wir schützen Klima & Wirtschaft,\nsorgen für Gerechtigkeit,\nverteidigen Demokratie & Freiheit\nund schaffen Frieden & Sicherheit.';
const ZITAT_TEXT =
  'Wir schützen ==Klima & Wirtschaft==, sorgen für ==Gerechtigkeit==, verteidigen ==Demokratie & Freiheit== und schaffen ==Frieden & Sicherheit==.';

// ============================================================================
// LAYOUTS
// ============================================================================

function titel(b: SlideBuilder, light: boolean) {
  const flower = b.ink.watermark;
  // Dunkel liegt die Blume oben rechts angeschnitten, hell mittig unter dem Text.
  if (flower && light) b.asset('folie-blume', flower.assetId, 1500, 520, 1050, flower.opacity);
  else if (flower) b.asset('folie-blume', flower.assetId, 1440, 340, 1000, flower.opacity);
  b.headline('folie-headline', 'Titelfolie', M, 30, 1700, 320);
  // Schmal wie im CD: gut 60 % der Breite.
  b.text('folie-text', TITEL_TEXT, M, 410, 1150, 38, { lineHeight: 1.3 });
}

function titelBild(b: SlideBuilder) {
  b.headline('folie-headline', 'Titelfolie\nmit Bild', M, 20, 1300, 280);
  b.text('folie-text', 'Unterüberschrift', M, 660, 1000, 36, { type: 'subheader' });
}

function textBild(b: SlideBuilder, photoLeft: boolean) {
  const panelX = photoLeft ? W - PANEL : 0;
  b.shape('folie-flaeche', 'rect', panelX + PANEL / 2, H / 2, PANEL, H, b.ink.ground);
  b.lock('folie-flaeche');
  const x = panelX + PANEL_PAD;
  const width = PANEL - PANEL_PAD * 2;
  b.headline('folie-headline', 'Beispiel mit\nText & Bild', x, 50, width, 128);
  b.text('folie-text', TEXT_BILD_TEXT, x, 400, width, 40, { lineHeight: 1.4 });
  if (photoLeft) stoerer(b, 275, 205, STOERER_FILL.magenta);
  else stoerer(b, 1033, 230, STOERER_FILL.magenta);
}

function textfolie(b: SlideBuilder) {
  b.headline('folie-headline', 'Textfolie', M, 50, 1200, 128);
  const col = 820;
  b.text(
    'folie-spalte-1',
    '• Hier steht nur Text. Ein bisschen langweilig, aber manchmal muss auch das sein. Denn nicht zu jedem Gedanken gibt es das passende Bild.\n• Ein guter Trick: Achte darauf, dass deine Zeilen nicht zu lang werden. Das menschliche Auge',
    M,
    300,
    col,
    36,
    { lineHeight: 1.4 }
  );
  b.text(
    'folie-spalte-2',
    'kann einer zu langen Zeile schwer folgen und verrutscht beim Zeilenumsprung. **Versuche deinen Text in zwei Spalten anzulegen.** So macht auch das Lesen längerer Texte noch Spaß.',
    1010,
    300,
    col,
    36,
    { lineHeight: 1.4 }
  );
  stoerer(b, 1685, 783, STOERER_FILL.blau);
}

function chartColors(locale: BrandLocale, ground: string): string[] {
  if (locale === 'de-AT') return getBrandPack('de-AT').chart.filter((c) => c !== ground);
  // Die Reihen der CD-Vorlage: Klee, Grashalm, Himmel und Gelb.
  return [brand('klee'), brand('grashalm'), brand('himmel'), AT.colors.accent];
}

function diagramm(b: SlideBuilder, locale: BrandLocale) {
  b.headline('folie-headline', 'Diagramm Vorlage', M, 50, 1500, 128);
  const colors = chartColors(locale, b.ink.ground);
  const base = {
    rotation: 0,
    opacity: 1,
    unit: '',
    showValues: false,
    background: b.ink.ground,
  };
  // Diagramme zeichnen ihre Beschriftung bei 13 px; Maßstab 2 macht daraus 26 px.
  const scale = 2;
  b.text('folie-diagramm-1-titel', 'Balken', M, 260, 800, 30, { align: 'center' });
  b.chart({
    ...base,
    id: 'folie-diagramm-1',
    x: M,
    y: 310,
    width: 400,
    height: 340,
    scale,
    chartType: 'bar',
    // Die Beispielwerte der CD-Vorlage: drei Reihen über vier Kategorien.
    data: [
      { name: 'Kategorie 1', value: 4.3 },
      { name: 'Kategorie 2', value: 2.5 },
      { name: 'Kategorie 3', value: 3.5 },
      { name: 'Kategorie 4', value: 4.5 },
    ],
    series: [
      { name: 'Datenreihe 1', values: [4.3, 2.5, 3.5, 4.5] },
      { name: 'Datenreihe 2', values: [2.4, 4.4, 1.8, 2.8] },
      { name: 'Datenreihe 3', values: [2, 2, 3, 5] },
    ],
    colors: colors.slice(0, 3),
    title: '',
    showLegend: true,
    legendPosition: 'bottom',
    showGrid: true,
  });
  b.text('folie-diagramm-2-titel', 'Torte', 1030, 260, 800, 30, { align: 'center' });
  b.chart({
    ...base,
    id: 'folie-diagramm-2',
    x: 1030,
    y: 310,
    width: 400,
    height: 340,
    scale,
    chartType: 'pie',
    data: [
      { name: '1. Quartal', value: 8.2 },
      { name: '2. Quartal', value: 3.2 },
      { name: '3. Quartal', value: 1.4 },
      { name: '4. Quartal', value: 1.2 },
    ],
    colors: colors.slice(0, 4),
    title: '',
    showLegend: true,
    legendPosition: 'bottom',
    showGrid: false,
  });
}

function zitat(b: SlideBuilder, withPhoto: boolean, locale: BrandLocale) {
  // Gotham Ultra läuft breiter und zeichnet eckige Anführungen: kleiner in Österreich.
  const at = locale === 'de-AT';
  // Die Anführungszeichen als Text mit Kontur: bleibt nativ und färbbar.
  const quote = at ? 640 : 1000;
  b.text('folie-anfuehrung', '”', M - quote * 0.06, at ? 20 : -30, quote, quote, {
    family: b.ink.headline,
    fill: 'rgba(255,255,255,0)',
    stroke: { color: b.ink.quote, width: 6 },
    lineHeight: 1,
  });
  b.text('folie-intro', ZITAT_INTRO, M, 262, 1400, 50, { type: 'subheader' });
  const width = withPhoto ? 1500 : 1720;
  const size = (withPhoto ? 108 : 126) * (at ? 0.8 : 1);
  b.text('folie-zitat', withPhoto ? ZITAT_TEXT_FOTO : ZITAT_TEXT, M, 340, width, size, {
    type: 'header',
    family: b.ink.headline,
    lineHeight: 1.07,
    accent: withPhoto ? null : b.ink.accent,
  });
}

function bildfolie(b: SlideBuilder) {
  b.headline('folie-headline', 'Bildfolie', M, 50, 1200, 128);
}

function danke(b: SlideBuilder, locale: BrandLocale) {
  const at = locale === 'de-AT';
  // DE: Wortmarke 710 × 379, 390 px breit. AT: Logo mit Claim, 260 px breit.
  if (at) b.asset('folie-logo', b.ink.logoAssetId, M + 130, HEAD_TOP + 114, 260);
  else b.asset('folie-logo', b.ink.logoAssetId, M + 195, HEAD_TOP + 104, 390);
  const contact = at
    ? 'Vorname Nachname\nTitel\n\n**DIE GRÜNEN**\nBezirksorganisation Musterstadt\nMusterstraße 1\n1010 Wien\n\nT +43 1 2345678\nF +43 1 2345678\nmail@website.at'
    : 'Vorname Nachname\nTitel\n\n**BÜNDNIS 90/DIE GRÜNEN**\nKV Musterstadt\nMusterstraße 1\n12345 Musterstadt\n\nT +49 12 3456789\nF +49 12 3456789\nmail@website.de';
  b.text('folie-kontakt', contact, M, 480, 600, 28, { lineHeight: 1.3 });
  b.headline('folie-headline', 'Vielen Dank', 640, at ? 365 : 330, W - M - 640, at ? 190 : 250);
  b.text('folie-text', 'für eure Aufmerksamkeit!', 720, 600, 1100, at ? 72 : 100, {
    type: 'subheader',
    family: b.ink.headline,
    align: 'right',
  });
}

const PHOTO_OF: Partial<Record<SlideLayoutId, string>> = {
  'titel-bild': PHOTO.sonnenblume,
  'text-bild': PHOTO.sonnenblume,
  'bild-text': PHOTO.sonnenblume,
  'zitat-bild': PHOTO.abend,
  bildfolie: PHOTO.sonnenblume,
  'text-bild-hell': PHOTO.sonnenblume,
  'bild-text-hell': PHOTO.sonnenblume,
};

/** Grund der Texte: auf dem Vollbildfoto weiß, sonst nach dem Thema der Folie. */
function grundOf(id: SlideLayoutId): Grund {
  if (id === 'titel-bild' || id === 'zitat-bild' || id === 'bildfolie') return 'foto';
  return SLIDE_LAYOUTS.find((l) => l.id === id)!.theme;
}

/** Der volle Seitenzustand eines Layouts — bei jedem Aufruf ein neues Objekt. */
export function buildSlideLayout(id: SlideLayoutId, options: SlideLayoutOptions): SlideLayoutState {
  const grund = grundOf(id);
  const b = new SlideBuilder(inkFor(options.locale, grund), PHOTO_OF[id] ?? null);
  switch (id) {
    case 'titel':
    case 'titel-hell':
      titel(b, id === 'titel-hell');
      break;
    case 'titel-bild':
      titelBild(b);
      break;
    case 'text-bild':
    case 'text-bild-hell':
      textBild(b, false);
      break;
    case 'bild-text':
    case 'bild-text-hell':
      textBild(b, true);
      break;
    case 'textfolie':
    case 'textfolie-hell':
      textfolie(b);
      break;
    case 'diagramm':
    case 'diagramm-hell':
      diagramm(b, options.locale);
      break;
    case 'zitat':
    case 'zitat-hell':
      zitat(b, false, options.locale);
      break;
    case 'zitat-bild':
      zitat(b, true, options.locale);
      break;
    case 'bildfolie':
      bildfolie(b);
      break;
    case 'danke':
      danke(b, options.locale);
      break;
  }
  mark(b);
  footer(b, options);
  return b.state;
}

/**
 * Die Bausteine der Layouts für die Deck-Stile (`deckStile/`): der `cd`-Stil
 * baut auf den vorhandenen Folien auf, statt sie nachzubauen.
 */
export const slideKit = {
  inkFor,
  mark,
  titel,
  textfolie,
  zitat,
  danke,
  M,
  W,
  H,
  FOOTER,
  STOERER,
  STOERER_FILL,
} as const;
