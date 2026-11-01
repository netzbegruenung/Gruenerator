import { CANVAS_COLORS, type MarketplaceCollectionId } from '@gruenerator/contracts';

import { BRAND_COLORS } from '../image-studio/modification-constants.js';

import { type ProfilbildAssetSrc } from './assets.js';

export type FlatBackground =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; stops: string[]; angle: number }
  | { kind: 'stripes'; colors: string[] };

export interface Swatch {
  id: string;
  label: string;
  background: FlatBackground;
}

const color = (id: string, label: string, c: string): Swatch => ({
  id,
  label,
  background: { kind: 'color', color: c },
});

export const COLOR_SWATCHES_DE: Swatch[] = [
  color('tanne', 'Tanne', CANVAS_COLORS.TANNE),
  color('klee', 'Klee', CANVAS_COLORS.KLEE),
  color('sonne', 'Sonne', CANVAS_COLORS.SONNE),
  color('himmel', 'Himmel', CANVAS_COLORS.HIMMEL),
  color('sand', 'Sand', CANVAS_COLORS.SAND),
  color('weiss', 'Weiß', CANVAS_COLORS.WHITE),
  color('schwarz', 'Schwarz', CANVAS_COLORS.BLACK),
];

/** Mirrors the de-AT brand theme in packages/canvas-editor/src/brand/theme.ts. */
const AT = { DUNKELGRUEN: '#257639', HELLGRUEN: '#56af31', GELB: '#FCEC00', MAGENTA: '#E4007C' };

export const COLOR_SWATCHES_AT: Swatch[] = [
  color('dunkelgruen', 'Dunkelgrün', AT.DUNKELGRUEN),
  color('hellgruen', 'Hellgrün', AT.HELLGRUEN),
  color('gelb', 'Gelb', AT.GELB),
  color('magenta', 'Magenta', AT.MAGENTA),
  color('weiss', 'Weiß', CANVAS_COLORS.WHITE),
  color('schwarz', 'Schwarz', CANVAS_COLORS.BLACK),
];

const gradient = (id: string, label: string, stops: string[], angle: number): Swatch => ({
  id,
  label,
  background: { kind: 'gradient', stops, angle },
});

export const GRADIENT_SWATCHES: Swatch[] = [
  gradient('tanne-klee', 'Verlauf Tanne zu Klee', [CANVAS_COLORS.TANNE, CANVAS_COLORS.KLEE], 180),
  gradient(
    'klee-grashalm',
    'Verlauf Klee zu Grashalm',
    [CANVAS_COLORS.KLEE, BRAND_COLORS.GRASHALM],
    135
  ),
  gradient(
    'himmel-tanne',
    'Verlauf Himmel zu Tanne',
    [CANVAS_COLORS.HIMMEL, CANVAS_COLORS.TANNE],
    180
  ),
  gradient('sonne-sand', 'Verlauf Sonne zu Sand', [CANVAS_COLORS.SONNE, CANVAS_COLORS.SAND], 180),
  gradient('sand-klee', 'Verlauf Sand zu Klee', [CANVAS_COLORS.SAND, CANVAS_COLORS.KLEE], 180),
  gradient(
    'tanne-nacht',
    'Verlauf Tanne zu Schwarz',
    [CANVAS_COLORS.TANNE, CANVAS_COLORS.BLACK],
    160
  ),
];

/** Verläufe aus dem AT-CD 2026 — Dunkelgrün dominiert, Hellgrün lockert auf. */
export const GRADIENT_SWATCHES_AT: Swatch[] = [
  gradient('at-dunkel-hell', 'Verlauf Dunkelgrün zu Hellgrün', [AT.DUNKELGRUEN, AT.HELLGRUEN], 180),
  gradient('at-hell-gelb', 'Verlauf Hellgrün zu Gelb', [AT.HELLGRUEN, AT.GELB], 135),
  gradient('at-dunkel-magenta', 'Verlauf Dunkelgrün zu Magenta', [AT.DUNKELGRUEN, AT.MAGENTA], 160),
  gradient(
    'at-dunkel-schwarz',
    'Verlauf Dunkelgrün zu Schwarz',
    [AT.DUNKELGRUEN, CANVAS_COLORS.BLACK],
    160
  ),
];

export const colorSwatches = (isAustria: boolean): Swatch[] =>
  isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE;

export const gradientSwatches = (isAustria: boolean): Swatch[] =>
  isAustria ? GRADIENT_SWATCHES_AT : GRADIENT_SWATCHES;

/** Id einer frei gewählten Farbe oder eines frei gewählten Verlaufs. */
export const FREE_BACKGROUND_ID = 'eigene-farbe';

/** Was frei gewählt werden kann — eine Farbe oder ein Verlauf aus zwei Farben. */
export type FreeBackground = Extract<FlatBackground, { kind: 'color' | 'gradient' }>;

const HEX = /^#[0-9a-f]{6}$/i;

/** Prüft eine gespeicherte freie Farbe; alles andere ist kein gültiger Hintergrund. */
export function parseFreeBackground(raw: unknown): FreeBackground | null {
  const bg = raw as { kind?: unknown; color?: unknown; stops?: unknown; angle?: unknown } | null;
  if (bg?.kind === 'color' && typeof bg.color === 'string' && HEX.test(bg.color))
    return { kind: 'color', color: bg.color.toLowerCase() };
  if (
    bg?.kind === 'gradient' &&
    Array.isArray(bg.stops) &&
    bg.stops.length === 2 &&
    bg.stops.every((c): c is string => typeof c === 'string' && HEX.test(c)) &&
    typeof bg.angle === 'number' &&
    Number.isFinite(bg.angle)
  )
    return {
      kind: 'gradient',
      stops: bg.stops.map((c) => c.toLowerCase()),
      angle: ((bg.angle % 360) + 360) % 360,
    };
  return null;
}

export const PRIDE_STRIPES = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'];

export interface PresetOverlay {
  src: ProfilbildAssetSrc;
  x: number;
  y: number;
  width: number;
  opacity: number;
}

export interface PresetDesign {
  id: string;
  label: string;
  base: FlatBackground;
  overlays: PresetOverlay[];
  /** Offered only through this Marktplatz collection, not in the picker. */
  kollektion?: MarketplaceCollectionId;
}

/** Große Sonnenblume, angeschnitten oben rechts — das Motiv der Vorlagen. */
const bigSunflower = (
  src: '/sonnenblume_weiss.svg' | '/sonnenblume_gruen.png',
  opacity: number
): PresetOverlay => ({ src, x: 0.8, y: 0.28, width: 1, opacity });

/** Die angebotenen Vorlagen: die große Sonnenblume in Farben und Lagen, dazu Pride. */
export function presetDesigns(_isAustria: boolean): PresetDesign[] {
  return [
    {
      id: 'tanne-sonnenblume',
      label: 'Tanne mit großer Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.TANNE },
      overlays: [bigSunflower('/sonnenblume_weiss.svg', 0.12)],
    },
    {
      id: 'klee-sonnenblume-gross',
      label: 'Klee mit großer Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.KLEE },
      overlays: [bigSunflower('/sonnenblume_weiss.svg', 0.16)],
    },
    {
      id: 'himmel-sonnenblume',
      label: 'Himmel mit großer Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.HIMMEL },
      overlays: [bigSunflower('/sonnenblume_weiss.svg', 0.18)],
    },
    {
      id: 'sand-sonnenblume-gross',
      label: 'Sand mit großer Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.SAND },
      overlays: [bigSunflower('/sonnenblume_gruen.png', 0.22)],
    },
    {
      id: 'sonne-sonnenblume',
      label: 'Sonne mit großer Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.SONNE },
      overlays: [bigSunflower('/sonnenblume_weiss.svg', 0.22)],
    },
    {
      id: 'tanne-sonnenblume-mitte',
      label: 'Tanne mit Sonnenblume hinter der Person',
      base: { kind: 'color', color: CANVAS_COLORS.TANNE },
      overlays: [{ src: '/sonnenblume_weiss.svg', x: 0.5, y: 0.42, width: 1.3, opacity: 0.1 }],
    },
    {
      id: 'tanne-klee-sonnenblume',
      label: 'Verlauf Tanne zu Klee mit Sonnenblume',
      base: { kind: 'gradient', stops: [CANVAS_COLORS.TANNE, CANVAS_COLORS.KLEE], angle: 180 },
      overlays: [{ src: '/sonnenblume_weiss.svg', x: 0.18, y: 0.82, width: 1.1, opacity: 0.14 }],
    },
    {
      id: 'pride',
      label: 'Pride',
      base: { kind: 'stripes', colors: PRIDE_STRIPES },
      overlays: [],
    },
  ];
}

/**
 * Nicht mehr angebotene Vorlagen. Gespeicherte Profilbilder nennen sie beim Namen
 * (`background.id`), also bleiben sie auflösbar, statt still auf die erste Farbe
 * zurückzufallen. Ausgemustert 10/2026.
 */
function retiredPresetDesigns(isAustria: boolean): PresetDesign[] {
  return [
    {
      id: 'klee-sonnenblume',
      label: 'Klee mit Sonnenblume in der Ecke',
      base: { kind: 'color', color: CANVAS_COLORS.KLEE },
      overlays: [
        { src: '/images/Sonnenblume_RGB_gelb.png', x: 0.88, y: 0.12, width: 0.3, opacity: 1 },
      ],
    },
    {
      id: 'sand-sonnenblume',
      label: 'Sand mit grüner Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.SAND },
      overlays: [{ src: '/sonnenblume_gruen.png', x: 0.8, y: 0.24, width: 0.72, opacity: 0.45 }],
    },
    isAustria
      ? {
          id: 'logo',
          label: 'Dunkelgrün mit Logo',
          base: { kind: 'color', color: AT.DUNKELGRUEN },
          overlays: [
            { src: '/gruene-at-logo-weiss.png', x: 0.14, y: 0.13, width: 0.2, opacity: 1 },
          ],
        }
      : {
          id: 'logo',
          label: 'Tanne mit Logo',
          base: { kind: 'color', color: CANVAS_COLORS.TANNE },
          overlays: [{ src: '/gruene-de-logo-weiss.png', x: 0.19, y: 0.1, width: 0.3, opacity: 1 }],
        },
  ];
}

/** Ein Muster aus dem GJ-Design, das die ganze Fläche bedeckt. */
const fullOverlay = (src: ProfilbildAssetSrc): PresetOverlay => ({
  src,
  x: 0.5,
  y: 0.5,
  width: 1,
  opacity: 1,
});

/** GJ-Farben, wie sie die Sharepics der Grünen Jugend tragen (grueneBrand.ts). */
const GJ = { HELLGRUEN: '#C7FF7A', LAVENDEL: '#9F88FF', APRICOT: '#FF8568', WIESE: '#33C270' };
const GJ_AT = { WALDGRUEN: '#005424', MAIGRUEN: '#92CE26', CREME: '#F2F0E0', VEILCHEN: '#5C448C' };

/**
 * Die Hintergründe der Grünen Jugend, je Land eine Kollektion: nur über sie zu
 * haben, nicht im Wähler. Gespeicherte Profilbilder lösen sie trotzdem auf.
 */
export const COLLECTION_PRESET_DESIGNS: readonly PresetDesign[] = [
  {
    id: 'gj-hellgruen-zackenstern',
    label: 'Hellgrün mit Zackenstern',
    base: { kind: 'color', color: GJ.HELLGRUEN },
    overlays: [fullOverlay('/studio-tools/hintergruende/gj-hg-zackenstern.png')],
    kollektion: 'gruene-jugend',
  },
  {
    id: 'gj-lavendel-balken',
    label: 'Lavendel mit Balken',
    base: { kind: 'color', color: GJ.LAVENDEL },
    overlays: [fullOverlay('/studio-tools/hintergruende/gj-hg-balken.png')],
    kollektion: 'gruene-jugend',
  },
  {
    id: 'gj-apricot-pink',
    label: 'Apricot und Pink',
    base: { kind: 'color', color: GJ.APRICOT },
    overlays: [fullOverlay('/studio-tools/hintergruende/gj-hg-diagonal.png')],
    kollektion: 'gruene-jugend',
  },
  {
    id: 'gj-wiese-tape',
    label: 'Wiese mit Klebestreifen',
    base: { kind: 'color', color: GJ.WIESE },
    overlays: [fullOverlay('/studio-tools/hintergruende/gj-hg-tape.png')],
    kollektion: 'gruene-jugend',
  },
  {
    id: 'gj-at-waldgruen-raster',
    label: 'Waldgrün mit Raster',
    base: { kind: 'color', color: GJ_AT.WALDGRUEN },
    overlays: [fullOverlay('/studio-tools/hintergruende/gj-at-hg-raster.png')],
    kollektion: 'gruene-jugend-oesterreich',
  },
  {
    id: 'gj-at-creme-raster',
    label: 'Creme mit Raster',
    base: { kind: 'color', color: GJ_AT.CREME },
    overlays: [fullOverlay('/studio-tools/hintergruende/gj-at-hg-raster-creme.png')],
    kollektion: 'gruene-jugend-oesterreich',
  },
  {
    id: 'gj-at-maigruen',
    label: 'Maigrün',
    base: { kind: 'color', color: GJ_AT.MAIGRUEN },
    overlays: [],
    kollektion: 'gruene-jugend-oesterreich',
  },
  {
    id: 'gj-at-veilchen',
    label: 'Veilchen',
    base: { kind: 'color', color: GJ_AT.VEILCHEN },
    overlays: [],
    kollektion: 'gruene-jugend-oesterreich',
  },
];

/** Die Hintergründe, die nur eine Kollektion anbietet. */
export const presetsForCollection = (id: MarketplaceCollectionId): PresetDesign[] =>
  COLLECTION_PRESET_DESIGNS.filter((d) => d.kollektion === id);

/** Alles, was ein gespeichertes Profilbild als Vorlage nennen kann — angeboten, ausgemustert oder aus einer Kollektion. */
export function allPresetDesigns(isAustria: boolean): PresetDesign[] {
  return [
    ...presetDesigns(isAustria),
    ...retiredPresetDesigns(isAustria),
    ...COLLECTION_PRESET_DESIGNS,
  ];
}
