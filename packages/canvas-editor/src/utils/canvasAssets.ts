/**
 * Canvas Assets Registry
 * Centralized registry of all available decorative assets for canvas editor
 */
import { SHAREPIC_EMOJI, sharepicEmojiCode, type SharepicEmoji } from '@gruenerator/contracts';

export type AssetAudience = 'de-DE' | 'de-AT' | 'all';

export interface UniversalAsset {
  id: string;
  src: string;
  label: string;
  category: 'decoration' | 'mark' | 'emoji';
  tags: string[];
  /** Which brand locale the asset belongs to; 'all' is locale-independent. */
  audience: AssetAudience;
  /** Light artwork that needs a dark tile in the catalogue to stay visible. */
  darkPreview?: boolean;
}

/**
 * Assets werden auf eine einheitliche Kantenlaenge normalisiert: `AssetPrimitive`
 * rechnet die natuerliche Bildgroesse so um, dass die LAENGERE Seite bei
 * `scale: 1` genau so viele Pixel misst. Wer aus einer Vorlagen-Grafik mit
 * fester Breite/Hoehe eine Instanz macht, rechnet gegen dieselbe Zahl zurueck —
 * darum steht sie hier und nicht im Primitiv.
 */
export const ASSET_TARGET_SIZE = 150;

/**
 * Runtime instance of an asset placed on the canvas
 * Follows the same pattern as ShapeInstance and IllustrationInstance
 */
export interface AssetInstance {
  id: string;
  assetId: string; // Reference to UniversalAsset.id
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

/**
 * Factory function to create a new asset instance centered on the canvas
 */
export const createAssetInstance = (
  assetId: string,
  canvasWidth: number,
  canvasHeight: number
): AssetInstance => ({
  id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  assetId,
  x: canvasWidth / 2,
  y: canvasHeight / 2,
  scale: 1,
  rotation: 0,
  opacity: 1,
});

/**
 * System Assets Configuration
 * DRY: Single source of truth for all hardcoded asset paths used in layouts
 */
export const SYSTEM_ASSETS = {
  sunflower: {
    yellow: {
      src: '/Sonnenblume.png',
      label: 'Sonnenblume (Gelb)',
    },
    green: {
      src: '/sonnenblume_dunkelgruen.svg',
      label: 'Sonnenblume (Grün)',
    },
    // Light-green flower matching the Info sharepic's server render
    // (apps/api/public/sonnenblume_gruen.png).
    greenLight: {
      src: '/sonnenblume_gruen.png',
      label: 'Sonnenblume (Hellgrün)',
    },
    white: {
      src: '/sonnenblume_weiss.svg',
      label: 'Sonnenblume (Weiß)',
    },
    black: {
      src: '/sonnenblume_schwarz.svg',
      label: 'Sonnenblume (Schwarz)',
    },
  },
  quote: {
    white: {
      src: '/quote-white.svg',
      label: 'Anführungszeichen (Weiß)',
    },
    default: {
      src: '/quote.svg',
      label: 'Anführungszeichen',
    },
    // Österreich (de-AT): das Anführungszeichen steht dort in Gelb (CI 2026).
    gelb: {
      src: '/quote-gelb.svg',
      label: 'Anführungszeichen (Gelb)',
    },
  },
  // Deutschland (de-DE) — Wortmarke "BÜNDNIS 90 / DIE GRÜNEN". Die Farbfassung
  // (sandfarbene Schrift) ist für dunkle Hintergründe gedacht.
  logoDe: {
    farbe: {
      src: '/gruene-de-logo.png',
      label: 'Logo Bündnis 90/Die Grünen',
    },
    weiss: {
      src: '/gruene-de-logo-weiss.png',
      label: 'Logo weiß',
    },
    schwarz: {
      src: '/gruene-de-logo-schwarz.png',
      label: 'Logo schwarz',
    },
  },
  // Österreich (de-AT) — reduziertes Ein-Balken-Logo "G DIE GRÜNEN" (CI 2026)
  logoAt: {
    weiss: {
      src: '/gruene-at-logo-weiss.png',
      label: 'Die Grünen (weiß)',
    },
    gruen: {
      src: '/gruene-at-logo-gruen.png',
      label: 'Die Grünen (grün)',
    },
  },
  arrow: {
    src: '/arrow_right.svg',
    label: 'Pfeil rechts',
  },
  // Österreich (de-AT): der Wischen-Pfeil der Karussells als Pinselstrich.
  brushArrow: {
    weiss: {
      src: '/brush-arrow-weiss.svg',
      label: 'Pinselpfeil (Weiß)',
    },
    gruen: {
      src: '/brush-arrow-gruen.svg',
      label: 'Pinselpfeil (Grün)',
    },
  },
  backgrounds: {
    info: {
      tanne: '/Info_bg_tanne.png',
      sand: '/Info_bg_sand.png',
    },
  },
} as const;

/**
 * @deprecated Use SYSTEM_ASSETS.sunflower instead
 */
export const SYSTEM_SUNFLOWER = SYSTEM_ASSETS.sunflower;

/**
 * All available decorative assets that can be used across canvas types
 */
export const ALL_ASSETS: UniversalAsset[] = [
  {
    id: 'gruene-de-logo',
    src: SYSTEM_ASSETS.logoDe.farbe.src,
    label: SYSTEM_ASSETS.logoDe.farbe.label,
    category: 'decoration',
    tags: ['logo', 'bündnis 90', 'buendnis', 'grüne', 'gruene', 'deutschland', 'marke', 'farbe'],
    audience: 'de-DE',
    darkPreview: true,
  },
  {
    id: 'gruene-de-logo-weiss',
    src: SYSTEM_ASSETS.logoDe.weiss.src,
    label: SYSTEM_ASSETS.logoDe.weiss.label,
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
    src: SYSTEM_ASSETS.logoDe.schwarz.src,
    label: SYSTEM_ASSETS.logoDe.schwarz.label,
    category: 'decoration',
    tags: ['logo', 'bündnis 90', 'buendnis', 'grüne', 'gruene', 'deutschland', 'marke', 'schwarz'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower',
    src: SYSTEM_ASSETS.sunflower.yellow.src,
    label: SYSTEM_ASSETS.sunflower.yellow.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'gelb', 'yellow', 'natur', 'pflanze', 'sommer'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-green',
    src: SYSTEM_ASSETS.sunflower.green.src,
    label: SYSTEM_ASSETS.sunflower.green.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'grün', 'green', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-weiss',
    src: SYSTEM_ASSETS.sunflower.white.src,
    label: SYSTEM_ASSETS.sunflower.white.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'weiß', 'weiss', 'white', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-schwarz',
    src: SYSTEM_ASSETS.sunflower.black.src,
    label: SYSTEM_ASSETS.sunflower.black.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'schwarz', 'black', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'gruene-at-logo-weiss',
    src: SYSTEM_ASSETS.logoAt.weiss.src,
    label: SYSTEM_ASSETS.logoAt.weiss.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'weiß', 'weiss', 'marke'],
    audience: 'de-AT',
  },
  {
    id: 'gruene-at-logo-gruen',
    src: SYSTEM_ASSETS.logoAt.gruen.src,
    label: SYSTEM_ASSETS.logoAt.gruen.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'grün', 'gruen', 'marke'],
    audience: 'de-AT',
  },
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
  {
    id: 'brush-arrow-gruen',
    src: SYSTEM_ASSETS.brushArrow.gruen.src,
    label: SYSTEM_ASSETS.brushArrow.gruen.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'pinsel', 'brush', 'wischen', 'grün', 'gruen'],
    audience: 'de-AT',
  },
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
  {
    id: 'quote-mark-gelb',
    src: SYSTEM_ASSETS.quote.gelb.src,
    label: SYSTEM_ASSETS.quote.gelb.label,
    category: 'mark',
    tags: ['zitat', 'quote', 'gelb'],
    audience: 'de-AT',
  },
  {
    id: 'sunflower-green-light',
    src: SYSTEM_ASSETS.sunflower.greenLight.src,
    label: SYSTEM_ASSETS.sunflower.greenLight.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'grün', 'green', 'hell'],
    audience: 'de-DE',
  },
  {
    id: 'brush-arrow-weiss',
    src: SYSTEM_ASSETS.brushArrow.weiss.src,
    label: SYSTEM_ASSETS.brushArrow.weiss.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'pinsel', 'brush', 'wischen', 'weiß', 'weiss'],
    audience: 'de-AT',
  },
];

const EMOJI_NAMES: Record<SharepicEmoji, [label: string, ...tags: string[]]> = {
  '🗳️': ['Wahlurne', 'wahl', 'wählen', 'stimme'],
  '📰': ['Zeitung', 'presse', 'medien', 'nachrichten'],
  '🪧': ['Schild', 'demo', 'protest', 'plakat'],
  '✍️': ['Schreibende Hand', 'unterschrift', 'petition', 'schreiben'],
  '📣': ['Megafon', 'laut', 'aufruf', 'social media'],
  '📢': ['Lautsprecher', 'laut', 'ansage', 'aufruf'],
  '🤝': ['Handschlag', 'zusammenhalt', 'gemeinsam', 'verein'],
  '💚': ['Grünes Herz', 'herz', 'liebe', 'grün'],
  '❤️': ['Rotes Herz', 'herz', 'liebe'],
  '✅': ['Haken', 'ja', 'erledigt', 'check'],
  '❌': ['Kreuz', 'nein', 'falsch'],
  '👉': ['Zeigefinger', 'hinweis', 'pfeil'],
  '💪': ['Bizeps', 'stark', 'kraft'],
  '👏': ['Applaus', 'klatschen', 'danke'],
  '🧑‍🤝‍🧑': ['Menschen Hand in Hand', 'gemeinsam', 'menschen', 'solidarität'],
  '🌍': ['Erde', 'welt', 'klima', 'europa'],
  '🌱': ['Keimling', 'pflanze', 'wachstum', 'natur'],
  '🌳': ['Baum', 'wald', 'natur'],
  '🌻': ['Sonnenblume', 'blume', 'grüne'],
  '☀️': ['Sonne', 'solar', 'energie', 'sommer'],
  '💨': ['Wind', 'windkraft', 'luft'],
  '⚡': ['Blitz', 'strom', 'energie'],
  '🔥': ['Feuer', 'hitze', 'heizen'],
  '💧': ['Tropfen', 'wasser'],
  '♻️': ['Recycling', 'müll', 'kreislauf'],
  '🐝': ['Biene', 'artenschutz', 'natur', 'tiere'],
  '🚲': ['Fahrrad', 'rad', 'verkehr'],
  '🚆': ['Zug', 'bahn', 'verkehr'],
  '🚌': ['Bus', 'öffis', 'verkehr'],
  '🏠': ['Haus', 'wohnen', 'miete'],
  '🏫': ['Schule', 'bildung'],
  '🏥': ['Krankenhaus', 'gesundheit', 'pflege'],
  '💶': ['Euro-Schein', 'geld', 'euro', 'kosten'],
  '📈': ['Diagramm steigend', 'mehr', 'wachstum'],
  '📉': ['Diagramm fallend', 'weniger', 'sinken'],
  '📅': ['Kalender', 'termin', 'datum'],
  '📍': ['Pin', 'ort', 'vor ort'],
  '📱': ['Handy', 'smartphone', 'digital'],
  '💬': ['Sprechblase', 'gespräch', 'kommentar'],
  '💡': ['Glühbirne', 'idee', 'tipp'],
  '⚖️': ['Waage', 'gerechtigkeit', 'recht'],
  '🕊️': ['Taube', 'frieden'],
  '🎓': ['Doktorhut', 'bildung', 'studium'],
  '🌈': ['Regenbogen', 'vielfalt', 'pride'],
};

/** The asset an emoji of a sharepic list is drawn with. */
export const emojiAssetId = (emoji: SharepicEmoji): string => `emoji-${sharepicEmojiCode(emoji)}`;

/** Noto Emoji (Apache-2.0, `public/emoji/LICENSE`): the closed set a sharepic list may use. */
export const EMOJI_ASSETS: UniversalAsset[] = SHAREPIC_EMOJI.map((emoji) => {
  const [label, ...tags] = EMOJI_NAMES[emoji];
  return {
    id: emojiAssetId(emoji),
    src: `/emoji/emoji_u${sharepicEmojiCode(emoji)}.svg`,
    label,
    category: 'emoji',
    tags: ['emoji', ...tags],
    audience: 'all',
  };
});

/** Katalog plus Vorlagen-Varianten — alles, was sich zu einer Grafik aufloesen laesst. */
const RESOLVABLE_ASSETS: UniversalAsset[] = [...ALL_ASSETS, ...TEMPLATE_ASSETS, ...EMOJI_ASSETS];

/**
 * Logo assets shown in the "Logos" (grafiken) category.
 * Only true logos (decoration) — marks like Anführungszeichen/Pfeil are excluded.
 */
export const LOGO_ASSETS: UniversalAsset[] = ALL_ASSETS.filter((a) => a.category === 'decoration');

export function hasDarkPreview(asset: UniversalAsset): boolean {
  return asset.darkPreview === true || /weiss|white/.test(asset.id);
}

export function assetMatchesLocale(asset: UniversalAsset, locale: AssetAudience): boolean {
  return asset.audience === 'all' || asset.audience === locale;
}

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
 * Get asset by ID — Katalog UND Vorlagen-Varianten, denn beide koennen als
 * Asset-Instanz auf der Flaeche liegen.
 */
export function getAssetById(id: string): UniversalAsset | undefined {
  return RESOLVABLE_ASSETS.find((asset) => asset.id === id);
}

/**
 * Welche Grafik steckt hinter dieser Quelle? Die Bruecke von einer Vorlage, die
 * ihre Bilder als `src` deklariert, zum Katalog, der sie ueber eine ID fuehrt —
 * die Vorlagen-Elemente und die Katalog-Eintraege sind dieselben Bilder, nur
 * zweimal aufgeschrieben (#3403).
 */
export function getAssetBySrc(src: string): UniversalAsset | undefined {
  return RESOLVABLE_ASSETS.find((asset) => asset.src === src);
}

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
