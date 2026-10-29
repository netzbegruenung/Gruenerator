/**
 * The Grünerator's own assets: party logos and word marks, the sunflowers,
 * AT's brush arrow and yellow quote mark, the Info backgrounds, beside the
 * plain marks its templates use (quote marks, arrow). `SYSTEM_ASSETS` is what
 * layouts and themes draw from; `ALL_ASSETS` and `TEMPLATE_ASSETS` go into
 * the asset catalogue the app registers (`grueneAssetCatalog.ts`). Ids and
 * files are F0, stored in canvases and templates.
 */
import {
  assetMatchesLocale,
  getAssetById,
  type AssetAudience,
  type UniversalAsset,
} from '@ggraphic/editor/utils/canvasAssets';
import { GRUENE_SYSTEM_ASSETS } from '@gruenerator/contracts/brand';

export { GRUENE_SYSTEM_ASSETS };

/** Logos and sunflowers, first in the picker (`ALL_ASSETS`). */
export const GRUENE_DECORATION_ASSETS: UniversalAsset[] = [
  {
    id: 'gruene-de-logo',
    src: GRUENE_SYSTEM_ASSETS.logoDe.farbe.src,
    label: GRUENE_SYSTEM_ASSETS.logoDe.farbe.label,
    category: 'decoration',
    tags: ['logo', 'bündnis 90', 'buendnis', 'grüne', 'gruene', 'deutschland', 'marke', 'farbe'],
    audience: 'de-DE',
    darkPreview: true,
  },
  {
    id: 'gruene-de-logo-weiss',
    src: GRUENE_SYSTEM_ASSETS.logoDe.weiss.src,
    label: GRUENE_SYSTEM_ASSETS.logoDe.weiss.label,
    category: 'decoration',
    tags: [
      'logo',
      'bündnis 90',
      'buendnis',
      'grüne',
      'gruene',
      'deutschland',
      'marke',
      'weiß',
      'weiss',
    ],
    audience: 'de-DE',
  },
  {
    id: 'gruene-de-logo-schwarz',
    src: GRUENE_SYSTEM_ASSETS.logoDe.schwarz.src,
    label: GRUENE_SYSTEM_ASSETS.logoDe.schwarz.label,
    category: 'decoration',
    tags: ['logo', 'bündnis 90', 'buendnis', 'grüne', 'gruene', 'deutschland', 'marke', 'schwarz'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower',
    src: GRUENE_SYSTEM_ASSETS.sunflower.yellow.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.yellow.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'gelb', 'yellow', 'natur', 'pflanze', 'sommer'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-green',
    src: GRUENE_SYSTEM_ASSETS.sunflower.green.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.green.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'grün', 'green', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-weiss',
    src: GRUENE_SYSTEM_ASSETS.sunflower.white.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.white.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'weiß', 'weiss', 'white', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-schwarz',
    src: GRUENE_SYSTEM_ASSETS.sunflower.black.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.black.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'schwarz', 'black', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'gruene-at-logo-weiss',
    src: GRUENE_SYSTEM_ASSETS.logoAt.weiss.src,
    label: GRUENE_SYSTEM_ASSETS.logoAt.weiss.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'weiß', 'weiss', 'marke'],
    audience: 'de-AT',
  },
  {
    id: 'gruene-at-logo-gruen',
    src: GRUENE_SYSTEM_ASSETS.logoAt.gruen.src,
    label: GRUENE_SYSTEM_ASSETS.logoAt.gruen.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'grün', 'gruen', 'marke'],
    audience: 'de-AT',
  },
];

/** Marks after the neutral ones in the picker. */
export const GRUENE_MARK_ASSETS: UniversalAsset[] = [
  {
    id: 'brush-arrow-gruen',
    src: GRUENE_SYSTEM_ASSETS.brushArrow.gruen.src,
    label: GRUENE_SYSTEM_ASSETS.brushArrow.gruen.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'pinsel', 'brush', 'wischen', 'grün', 'gruen'],
    audience: 'de-AT',
  },
];

/** Template variants (`TEMPLATE_ASSETS`): resolvable, not offered in the picker. */
export const GRUENE_TEMPLATE_ASSETS: UniversalAsset[] = [
  {
    id: 'quote-mark-gelb',
    src: GRUENE_SYSTEM_ASSETS.quoteGelb.src,
    label: GRUENE_SYSTEM_ASSETS.quoteGelb.label,
    category: 'mark',
    tags: ['zitat', 'quote', 'gelb'],
    audience: 'de-AT',
  },
  {
    id: 'sunflower-green-light',
    src: GRUENE_SYSTEM_ASSETS.sunflower.greenLight.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.greenLight.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'grün', 'green', 'hell'],
    audience: 'de-DE',
  },
  {
    id: 'brush-arrow-weiss',
    src: GRUENE_SYSTEM_ASSETS.brushArrow.weiss.src,
    label: GRUENE_SYSTEM_ASSETS.brushArrow.weiss.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'pinsel', 'brush', 'wischen', 'weiß', 'weiss'],
    audience: 'de-AT',
  },
];

/**
 * System Assets Configuration
 * DRY: Single source of truth for all hardcoded asset paths used in layouts
 */
export const SYSTEM_ASSETS = {
  sunflower: GRUENE_SYSTEM_ASSETS.sunflower,
  quote: {
    white: GRUENE_SYSTEM_ASSETS.quoteWhite,
    default: {
      src: '/quote.svg',
      label: 'Anführungszeichen',
    },
    gelb: GRUENE_SYSTEM_ASSETS.quoteGelb,
  },
  logoDe: GRUENE_SYSTEM_ASSETS.logoDe,
  logoAt: GRUENE_SYSTEM_ASSETS.logoAt,
  arrow: {
    src: '/arrow_right.svg',
    label: 'Pfeil rechts',
  },
  brushArrow: GRUENE_SYSTEM_ASSETS.brushArrow,
  backgrounds: GRUENE_SYSTEM_ASSETS.backgrounds,
} as const;

/**
 * @deprecated Use SYSTEM_ASSETS.sunflower instead
 */
export const SYSTEM_SUNFLOWER = SYSTEM_ASSETS.sunflower;

/**
 * All available decorative assets that can be used across canvas types
 */
export const ALL_ASSETS: UniversalAsset[] = [
  ...GRUENE_DECORATION_ASSETS,
  {
    id: 'quote-mark',
    src: SYSTEM_ASSETS.quote.default.src,
    label: SYSTEM_ASSETS.quote.default.label,
    category: 'mark',
    tags: ['zitat', 'quote', 'text', 'spruch', 'rede'],
    audience: 'all',
  },
  {
    id: 'arrow',
    src: SYSTEM_ASSETS.arrow.src,
    label: SYSTEM_ASSETS.arrow.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'richtung', 'zeiger', 'hinweis'],
    audience: 'all',
  },
  ...GRUENE_MARK_ASSETS,
];

/**
 * Vorlagen-Varianten: dieselben Grafiken in genau der Ausfuehrung, die eine
 * bestimmte Vorlage braucht — das weisse und das gelbe Anfuehrungszeichen, die
 * hellgruene Sonnenblume.
 *
 * Sie stehen bewusst NICHT in `ALL_ASSETS`: in der freien Auswahl waeren drei
 * fast gleiche Anfuehrungszeichen nur verwirrend, und ueber einem hellen
 * Hintergrund ist die weisse Fassung unsichtbar. Aufloesen muss man sie
 * trotzdem, seit eine duplizierte Vorlagen-Grafik zu einer Asset-Instanz wird
 * (#3403) — die zeichnet sich ueber `getAssetById`.
 */
export const TEMPLATE_ASSETS: UniversalAsset[] = [
  {
    id: 'quote-mark-weiss',
    src: SYSTEM_ASSETS.quote.white.src,
    label: SYSTEM_ASSETS.quote.white.label,
    category: 'mark',
    tags: ['zitat', 'quote', 'weiß', 'weiss'],
    audience: 'all',
  },
  ...GRUENE_TEMPLATE_ASSETS,
];

/**
 * Logo assets shown in the "Logos" (grafiken) category.
 * Only true logos (decoration) — marks like Anführungszeichen/Pfeil are excluded.
 */
export const LOGO_ASSETS: UniversalAsset[] = ALL_ASSETS.filter((a) => a.category === 'decoration');

/**
 * Locale-filtered logos ordered recommended-first — shared by the Marke strip,
 * the Marke drill-down and the mobile subsection. AT users only see the AT
 * logo variants; DE users the DE marks.
 */
export function sortLogoAssets(
  recommendedAssetIds: readonly string[],
  locale: AssetAudience = 'de-DE'
): UniversalAsset[] {
  const logos = LOGO_ASSETS.filter((a) => assetMatchesLocale(a, locale));
  const recommended = logos.filter((a) => recommendedAssetIds.includes(a.id));
  const others = logos.filter((a) => !recommendedAssetIds.includes(a.id));
  return [...recommended, ...others];
}

/**
 * Mapping of canvas types to their recommended (default) assets
 * These appear in the "Empfohlen" section at the top
 */
export const CANVAS_RECOMMENDED_ASSETS: Record<string, string[]> = {
  zitat: ['quote-mark'],
  'zitat-pure': ['sunflower-green', 'quote-mark'],
  simple: [],
  info: ['arrow'],
  dreizeilen: ['sunflower'],
  veranstaltung: [],
};

/**
 * Get recommended assets for a canvas type
 */
export function getRecommendedAssets(canvasType: string): UniversalAsset[] {
  const recommendedIds = CANVAS_RECOMMENDED_ASSETS[canvasType] || [];
  return recommendedIds
    .map((id) => getAssetById(id))
    .filter((asset): asset is UniversalAsset => asset !== undefined);
}

/**
 * Get non-recommended assets for a canvas type
 */
export function getOtherAssets(canvasType: string): UniversalAsset[] {
  const recommendedIds = CANVAS_RECOMMENDED_ASSETS[canvasType] || [];
  return ALL_ASSETS.filter((asset) => !recommendedIds.includes(asset.id));
}
